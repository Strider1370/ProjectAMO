export function isTestMutationApiEnabled(env = process.env) {
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'test') return false
  if (env.ENABLE_TEST_MUTATIONS !== '1') return false
  return typeof env.DATA_PATH === 'string' && env.DATA_PATH.trim().length > 0
}

export function mountTestMutationApi(app, createRouter, env = process.env) {
  if (!isTestMutationApiEnabled(env)) return false
  app.use('/api/dev', createRouter())
  return true
}

export default { isTestMutationApiEnabled, mountTestMutationApi }
