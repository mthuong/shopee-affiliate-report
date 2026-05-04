describe('CROP_CONFIRM_ENABLED', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM
    else process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = ORIGINAL
    jest.resetModules()
  })

  it('defaults to true when env var is unset', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = await import('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(true)
  })

  it('is true when env var is "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = 'true'
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = await import('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(true)
  })

  it('is false when env var is exactly "false"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = 'false'
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = await import('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(false)
  })
})
