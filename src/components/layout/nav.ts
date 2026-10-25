/** Ordered like the descent: the whole car → the systems → the mechanisms → the people → you. */
export const primaryNav = [
  { to: '/explore', label: 'Explore the Car' },
  { to: '/learn', label: 'Learn' },
  { to: '/labs', label: 'Labs' },
  { to: '/pioneers', label: 'Pioneers' },
  { to: '/progress', label: 'My Progress' },
] as const

/** Reachable from Explore, Learn and the home page; listed in the mobile menu and footer. */
export const secondaryNav = [{ to: '/map', label: 'System Map' }] as const
