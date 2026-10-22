import { SOCIAL_LINKS } from "@/lib/social-links";

export function SocialLinks() {
  return (
    <nav
      aria-label="MISSIRIA social media"
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted"
    >
      {SOCIAL_LINKS.map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
