type Props = React.HTMLAttributes<HTMLDivElement> & { direction?: 'row' | 'col' }

export function Stack({ direction = 'col', className = '', ...rest }: Props) {
  const dir = direction === 'row' ? 'flex-row' : 'flex-col'
  return <div className={`flex ${dir} gap-gutter ${className}`.trim()} {...rest} />
}
