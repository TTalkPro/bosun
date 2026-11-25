export const paths = {
  projects: '/projects',
  query: '/query',
  data: '/data',
  login: '/login',
  register: '/register',
  account: '/account',
  org: '/org',
  project: (key: string) => `/projects/${key.toUpperCase()}`,
  milestones: (key: string) => `/projects/${key.toUpperCase()}/milestones`,
  task: (id: string) => `/tasks/${id.toUpperCase()}`,
};
