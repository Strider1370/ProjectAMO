import { useState } from 'react'
import { Button, Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions, Field, Input, MessageBar, MessageBarBody } from '../../shared/ui/fluent.js'

// 브리핑 저장 이름 입력. 브라우저 기본 prompt/alert 대신 앱 안에서 이름을 받고 결과를 보여준다.
export default function SaveBriefingDialog({ defaultName, onSave, onClose }) {
  const [name, setName] = useState(defaultName ?? '')
  const [status, setStatus] = useState('idle') // idle | saving | saved | failed
  const save = async () => {
    setStatus('saving')
    const result = await onSave(name.trim() || defaultName)
    setStatus(result?.ok ? 'saved' : 'failed')
  }
  return (
    <Dialog open onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <form onSubmit={(event) => { event.preventDefault(); if (status !== 'saved') save() }}>
          <DialogBody>
            <DialogTitle>브리핑 저장</DialogTitle>
            <DialogContent>
              {status === 'saved' ? (
                <MessageBar intent="success"><MessageBarBody>저장했습니다. 왼쪽 아래 프로필 &gt; 저장한 브리핑에서 다시 열 수 있습니다.</MessageBarBody></MessageBar>
              ) : (
                <Field label="이름">
                  <Input value={name} onChange={(_, data) => setName(data.value)} autoFocus disabled={status === 'saving'} />
                </Field>
              )}
              {status === 'failed' && (
                <MessageBar intent="error"><MessageBarBody>저장하지 못했습니다. 저장한 브리핑이 5개라면 계정에서 하나를 지우고 다시 시도하세요.</MessageBarBody></MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              {status === 'saved' ? (
                <Button appearance="primary" type="button" onClick={onClose}>닫기</Button>
              ) : (
                <>
                  <Button appearance="secondary" type="button" onClick={onClose}>취소</Button>
                  <Button appearance="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '저장 중…' : '저장'}</Button>
                </>
              )}
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  )
}
