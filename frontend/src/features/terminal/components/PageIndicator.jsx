export function PageIndicator({ currentPage, pageCount }) {
  return <div className="terminal-page-indicator" role="img" aria-label={`${currentPage + 1} / ${pageCount} 페이지`}>
    {Array.from({ length: pageCount }, (_, index) => <i key={index} aria-hidden="true" className={index === currentPage ? 'is-current' : ''} />)}
  </div>
}
