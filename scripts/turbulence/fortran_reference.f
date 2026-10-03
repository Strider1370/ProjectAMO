c     Input/output adapter: all diagnostic and combination arithmetic
c     is called from the original sources included by the operational main.
      program turbulence_reference
      implicit none
      include 'consts.inc'
      include 'scoreparams.inc'
      include 'scorei.inc'
      include 'gtg_inputs.inc'
      include 'mwtpoly.inc'
      integer nxg,nyg,nzg,k,ii,jj,ios,nindices,ierr
      integer imin,imax,jmin,jmax,kmin,kmax,kta,mbc
      integer kmins(3),kmaxs(3)
      real lonmin,lonmax,latmin,latmax,dx,dy
      real zbdy(3,2)
      real, allocatable :: u(:,:,:),v(:,:,:),w(:,:,:),z(:,:,:)
      real, allocatable :: t(:,:,:),p(:,:,:),q(:,:,:)
      real, allocatable :: ql(:,:,:),qi(:,:,:),th(:,:,:),ri(:,:,:)
      real, allocatable :: tke(:,:,:),work(:,:,:,:),pr(:)
      real, allocatable :: hgt(:,:),hpbl(:,:),ps(:,:),lat(:,:)
      real, allocatable :: lon(:,:),mx(:,:),my(:,:),cor(:,:)
      real, allocatable :: zero2(:,:),miss2(:,:),mws(:,:),mwf(:,:)
      real, allocatable :: work2(:,:,:),qix(:,:,:)
      real, allocatable :: catout(:,:,:),mwtout(:,:,:),gtgout(:,:,:)
      integer, allocatable :: mask(:,:),k3d(:,:,:)
      character*200 infile,outdir,configfile,mode
      call get_command_argument(1,infile)
      call get_command_argument(2,outdir)
      call get_command_argument(3,configfile)
      call get_command_argument(4,mode)
      open(10,file=infile,access='stream',form='unformatted',
     1 status='old',iostat=ios)
      if(ios.ne.0) stop 10
      read(10) nxg,nyg,nzg,lonmin,lonmax,latmin,latmax
      if(nzg.lt.17.or.nzg.gt.201) stop 11
      allocate(u(nxg,nyg,nzg),v(nxg,nyg,nzg),w(nxg,nyg,nzg))
      allocate(z(nxg,nyg,nzg),t(nxg,nyg,nzg),q(nxg,nyg,nzg))
      allocate(p(nxg,nyg,nzg),ql(nxg,nyg,nzg),qi(nxg,nyg,nzg))
      allocate(th(nxg,nyg,nzg),ri(nxg,nyg,nzg),tke(nxg,nyg,nzg))
      allocate(work(nxg,nyg,nzg,8),pr(nzg))
      allocate(hgt(nxg,nyg),hpbl(nxg,nyg),ps(nxg,nyg))
      allocate(lat(nxg,nyg),lon(nxg,nyg),mx(nxg,nyg),my(nxg,nyg))
      allocate(cor(nxg,nyg),zero2(nxg,nyg),miss2(nxg,nyg))
      allocate(mws(nxg,nyg),mwf(nxg,nyg),work2(nxg,nyg,3))
      allocate(qix(nxg,nyg,nzi),k3d(nxg,nyg,nzi),mask(nxg,nyg))
      allocate(catout(nxg,nyg,nzg),mwtout(nxg,nyg,nzg))
      allocate(gtgout(nxg,nyg,nzg))
      read(10) u,v,w,z,t,q,pr,ps,hgt,hpbl
      close(10)
      do k=1,nzg
        p(:,:,k)=pr(k)
      enddo
      do jj=1,nyg
      do ii=1,nxg
        lat(ii,jj)=latmin+(latmax-latmin)*(jj-1)/(nyg-1)
        lon(ii,jj)=lonmin+(lonmax-lonmin)*(ii-1)/(nxg-1)
        mx(ii,jj)=1./cos(lat(ii,jj)*DPI/180.)
      enddo
      enddo
      my=1.
c     Same regional compute halo as the Python trial; no global wrap.
      imin=11
      imax=nxg-10
      jmin=11
      jmax=nyg-10
      mbc=1
      mask=0
      mask(imin:imax,jmin:jmax)=1
      dx=Re*(lonmax-lonmin)*DPI/180./(nxg-1)
      dy=Re*(latmax-latmin)*DPI/180./(nyg-1)
      ql=0.
      qi=0.
      zero2=0.
      miss2=RMISSD
      tke=RMISSD
      th=RMISSD
      ri=RMISSD
      work=RMISSD
      work2=RMISSD
      qix=RMISSD
      k3d=-1
      kmin=1
      kmax=nzg
      kta=-1
      minregion=1
      maxregion=3
      remap_option=2
      use_equal_wts=.TRUE.
      select_ITFA_only=.TRUE.
      comp_ITFAMWT=.TRUE.
      comp_ITFADYN=.FALSE.
      ITFAcompOptn=1
      use_MWT_polygons=.FALSE.
      nMWTPolygons=0
      ic=nxg/2
      jc=nyg/2
      zsmin=100.
      zsmax=60000.
      do k=1,nzi
        zi(k)=(k-1)*1000.
        pstdi(k)=100000.*(1.-zi(k)/3.28/44330.)**5.255
      enddo
      open(20,file=trim(outdir)//'reference.log',status='replace')
      call read_config(configfile,default_wts,nindices,zbdy,
     1 0,ierr,20)
      if(ierr.ne.0) stop 12
      zregion(:,1)=(/100.,11000.,21000./)
      zregion(:,2)=(/10000.,20000.,60000./)
      call CheckIndices(10,0,20)
      if(count(jpickindx.gt.0).ne.24) stop 14
      do k=1,3
        if(abs(sum(static_wts(k,:),mask=
     1   ipickitfa(k,:).gt.0.and.iFcstType.eq.2)-1.).gt.1.e-6)
     2   stop 15
        if(abs(sum(static_wts(k,:),mask=
     1   ipickitfa(k,:).gt.0.and.iFcstType.eq.4)-1.).gt.1.e-6)
     2   stop 16
      enddo
      open(21,file=trim(outdir)//'configuration.bin',
     1 access='stream',form='unformatted',status='replace')
      write(21) jpickindx,ipickitfa,static_wts,lnedrfits(:,:,1:2)
      close(21)
      if(trim(mode).ne.'combine-only') then
        write(*,*) 'Original indices_gtg: ',nxg,nyg,nzg
        call indices_gtg(u,v,w,z,p,t,q,ql,qi,
     1  th,lat,lon,mx,my,cor,tke,ri,hgt,miss2,miss2,hpbl,
     2  zero2,zero2,zero2,zero2,zero2,zero2,zero2,mask,
     3  work(:,:,:,1),work(:,:,:,2),work(:,:,:,3),work(:,:,:,4),
     4  work(:,:,:,5),work(:,:,:,6),work(:,:,:,7),work(:,:,:,8),
     5  work2(:,:,1),work2(:,:,2),work2(:,:,3),miss2,
     6  0,0.,0.,0.,zi,pstdi,nzi,18000.,.FALSE.,qix,k3d,kta,
     7  mwf,mws,imin,imax,jmin,jmax,kmin,kmax,zsmin,zsmax,
     8  mbc,dx,dy,0,ic,jc,20,1,cname,jpickindx,nxg,nyg,nzg,
     9  idmax,outdir,10,3,0,ierr)
        if(ierr.ne.0) then
          write(*,*) 'indices_gtg ierr=',ierr
          stop 13
        endif
      endif
c     Same static native .F path as ITFAcompF; dynamic scoring is disabled.
      call GetkBdys(z,zi,nxg,nyg,nzg,nzi,imin,imax,jmin,jmax,
     1 kmins,kmaxs,zregion,1,3,3,0,20,1)
      open(21,file=trim(outdir)//'region-bounds.bin',
     1 access='stream',form='unformatted',status='replace')
      write(21) kmins,kmaxs
      close(21)
      write(*,*) 'Original ITFA: ',kmins,kmaxs
      if(trim(mode).eq.'active-main') then
c       Production adapter uses the active main's whole native driver.
        call ITFAcompF(catout,mwtout,gtgout,work(:,:,:,1),
     1   work(:,:,:,2),z,nxg,nyg,nzg,imin,imax,jmin,jmax,
     2   kmin,kmax,mbc,mask,comp_ITFAMWT,comp_ITFADYN,
     3   0,ic,jc,20,1,outdir)
      else
c       Independent comparison path calls the unchanged stages directly.
      call ITFA_MWT(work(:,:,:,1),work(:,:,:,2),mwtout,iditfam,
     1 nxg,nyg,nzg,1,3,3,ipickitfa,idmax,static_wts,iFcstType,
     2 2,imin,imax,jmin,jmax,kmins,kmaxs,mask,0,ic,jc,20,
     3 1,cname(iditfam),outdir,outdir,1)
      call ITFA_static(work(:,:,:,1),work(:,:,:,2),catout,iditfad,
     1 nxg,nyg,nzg,1,3,3,ipickitfa,idmax,static_wts,iFcstType,
     2 2,imin,imax,jmin,jmax,kmins,kmaxs,mask,0,ic,jc,20,
     3 1,cname(iditfad),outdir,outdir,1)
      call itfamax(catout,mwtout,gtgout,work(:,:,:,1),iditfad,
     1 iditfam,iditfax,1,3,3,imin,imax,jmin,jmax,kmins,kmaxs,
     2 mbc,mask,nxg,nyg,nzg,0,ic,jc,20,1,cname(iditfax),
     3 outdir,outdir,1)
      endif
      open(21,file=trim(outdir)//'combined.bin',
     1 access='stream',form='unformatted',status='replace')
      write(21) catout,mwtout,gtgout
      close(21)
      close(20)
      write(*,*) 'Original reference complete'
      end
