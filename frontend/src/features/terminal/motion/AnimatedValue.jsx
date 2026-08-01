export default function AnimatedValue({ as: Element = 'span', mode, order = 0, className = '', children, ...props }) {
  return (
    <Element
      {...props}
      className={`terminal-motion-value terminal-motion-value--${mode} ${className}`.trim()}
      data-terminal-motion-value=""
      style={{ ...props.style, '--terminal-motion-order': order }}
    >
      {children}
    </Element>
  )
}
