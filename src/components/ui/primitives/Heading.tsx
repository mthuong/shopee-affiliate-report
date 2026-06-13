type Level = 1 | 2 | 3 | 4
type Props = React.HTMLAttributes<HTMLHeadingElement> & { level?: Level }

export function Heading({ level = 1, className = '', ...rest }: Props) {
  const Tag = `h${level}` as const
  return <Tag className={`type-h${level} text-ink ${className}`.trim()} {...rest} />
}
