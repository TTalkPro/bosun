export const paths = {
  projects: '/projects',
  query: '/query',
  data: '/data',
  project: (key: string) => `/projects/${key.toUpperCase()}`,
  task: (id: string) => `/tasks/${id.toUpperCase()}`,
};
