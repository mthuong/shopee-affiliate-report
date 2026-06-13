type SurfaceVariant = 'page' | 'raised' | 'sunken' | 'inverse'

const BG: Record<SurfaceVariant, string> = {
  page: 'bg-page text-ink',
  raised: 'bg-raised text-ink',
  sunken: 'bg-sunken text-ink',
  inverse: 'bg-inverse text-on-inverse',
}

type Props = React.HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }

export function Surface({ variant = 'page', className = '', ...rest }: Props) {
  return <div className={`${BG[variant]} ${className}`.trim()} {...rest} />
}
