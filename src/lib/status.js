export const STATUS_META = {
  draft: {
    label: 'Draft',
    actionLabel: 'Draft',
    badgeClass: 'bsd',
    sidebarClass: 'bd',
    color: '#94a3b8',
  },
  'in-progress': {
    label: 'In Progress',
    actionLabel: 'In progress',
    badgeClass: 'bsp',
    sidebarClass: 'bp',
    color: '#287575',
  },
  complete: {
    label: 'Complete',
    actionLabel: 'Complete',
    badgeClass: 'bsc',
    sidebarClass: 'bc',
    color: '#76B900',
  },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.draft;
}
