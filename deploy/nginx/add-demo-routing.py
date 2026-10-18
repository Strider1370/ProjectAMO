# 시연 쿠키(projectamo_demo=1)가 있는 요청만 시연 백엔드(3002)와 시연 자료로 보낸다. 다른 방문자는 그대로다.
# 운영 서버 적용(한 번): sudo cp /etc/nginx/conf.d/projectamo.conf{,.bak-demo} && sudo python3 deploy/nginx/add-demo-routing.py /etc/nginx/conf.d/projectamo.conf && sudo nginx -t && sudo systemctl reload nginx
# 이미 적용된 파일이면 아무것도 바꾸지 않는다.
import re, sys
p = sys.argv[1]
s = open(p).read()
if 'projectamo_demo_view' in s:
    print('already patched'); sys.exit(0)

maps = '''# 이 브라우저에서만 시연(backend/src/dev/demo-instance.js): 시연 쿠키가 있는 요청만 시연 백엔드로 보낸다.
map $cookie_projectamo_demo $projectamo_demo_view {
  default 0;
  "1" 1;
}
map $cookie_projectamo_demo $projectamo_backend {
  default http://127.0.0.1:3001;
  "1" http://127.0.0.1:3002;
}

'''
s = s.replace('limit_req_zone', maps + 'limit_req_zone', 1)

# API: 쿠키에 따라 운영·시연 백엔드로.
s = s.replace('proxy_pass http://127.0.0.1:3001;', 'proxy_pass $projectamo_backend;')

# 자료(/data): 시연 쿠키가 있으면 시연 백엔드가 시연 자료를 내보낸다. 같은 주소가 쿠키에 따라 달라지므로 Vary: Cookie.
demo_redirect = '    if ($projectamo_demo_view) { rewrite ^ /__projectamo_demo$uri last; }\n    add_header Vary "Cookie" always;\n'
def add_redirect(match):
    return match.group(0) + demo_redirect
# 자료 파일을 직접 내보내는(alias) /data 위치마다. 막는 위치(return 404)는 그대로 둔다(시연 백엔드도 같은 경계를 지킨다).
def add_redirect_if_alias(match):
    body_start = match.end()
    body = s_ref[0][body_start:s_ref[0].index('\n  }', body_start)]
    return match.group(0) + demo_redirect if 'alias ' in body else match.group(0)
s_ref = [s]
s = re.sub(r'  location (?:/data/|~\* "\^/data/[^\n]*) \{\n', add_redirect_if_alias, s)

demo_locations = '''  # 시연 쿠키가 있는 /data 요청(위 rewrite)을 시연 백엔드로. 시연 백엔드는 시연 자료 위치에서 내보낸다.
  location ^~ /__projectamo_demo/ {
    internal;
    rewrite ^/__projectamo_demo(/.*)$ $1 break;
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 비상용: 시연 서버가 꺼져 있어도 이 브라우저의 시연 쿠키를 지우고 실황으로 돌아온다.
  location = /demo-off {
    add_header Set-Cookie "projectamo_demo=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" always;
    add_header Cache-Control "no-store" always;
    return 302 /;
  }

'''
# @projectamo_data_backend(운영 자료 폴백) 앞에 둔다.
s = s.replace('  location @projectamo_data_backend {', demo_locations + '  location @projectamo_data_backend {', 1)
open(p, 'w').write(s)
print('patched')
