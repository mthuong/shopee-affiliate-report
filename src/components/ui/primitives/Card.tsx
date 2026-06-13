type Props = React.HTMLAttributes<HTMLDivElement>

export function Card({ className = '', ...rest }: Props) {
  return (
    <div
      className={`bg-raised text-ink border border-line rounded-card p-card shadow-card ${className}`.trim()}
      {...rest}
    />
  )
}
