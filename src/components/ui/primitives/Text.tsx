type TextVariant = 'body' | 'muted' | 'caption'

const STYLES: Record<TextVariant, string> = {
  body: 'type-body text-ink',
  muted: 'type-body text-muted',
  caption: 'type-caption text-muted',
}

type Props = React.HTMLAttributes<HTMLParagraphElement> & { variant?: TextVariant }

export function Text({ variant = 'body', className = '', ...rest }: Props) {
  return <p className={`${STYLES[variant]} ${className}`.trim()} {...rest} />
}
