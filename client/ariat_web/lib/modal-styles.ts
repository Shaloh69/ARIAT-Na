/**
 * Shared HeroUI Modal classNames for consistent frosted-glass styling.
 * Dark mode: deep slate glass. Light mode: overridden by html.light CSS rules in globals.css.
 * Apply via: <Modal classNames={modalClassNames} ...>
 */
export const modalClassNames = {
  backdrop: "backdrop-blur-md",
  base: "!bg-slate-900/95 border border-white/15 shadow-2xl !backdrop-blur-xl rounded-2xl",
  header: "!bg-transparent border-b border-white/12 !text-white",
  body: "!bg-transparent !text-slate-200",
  footer: "!bg-transparent border-t border-white/12",
  closeButton: "!text-white/70 hover:!text-white hover:!bg-white/10",
};
