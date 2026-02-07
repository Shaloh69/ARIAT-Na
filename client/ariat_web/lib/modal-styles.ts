/**
 * Shared HeroUI Modal classNames for consistent solid dark frosted-glass styling.
 * Apply via: <Modal classNames={modalClassNames} ...>
 * This is the HeroUI-recommended approach using the classNames prop.
 */
export const modalClassNames = {
  backdrop: 'bg-black/60 backdrop-blur-md',
  base: '!bg-slate-900/95 border border-white/15 shadow-2xl !backdrop-blur-xl rounded-2xl',
  header: '!bg-transparent border-b border-white/12 !text-white',
  body: '!bg-transparent !text-slate-200',
  footer: '!bg-transparent border-t border-white/12',
  closeButton: '!text-white/70 hover:!text-white hover:!bg-white/10',
};
