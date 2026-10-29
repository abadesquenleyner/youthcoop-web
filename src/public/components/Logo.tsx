import { plano } from '../../shared/inline';
import type { LogoRef } from '../../shared/types';
import { useSite } from '../SiteContext';

export function Logo({ logo, className }: { logo: LogoRef; className?: string }) {
  const { media, lang } = useSite();
  const m = logo.media_id != null ? media[String(logo.media_id)] : undefined;
  if (!m) return null;
  return <img className={className} src={m.url} alt={plano(logo.alt, lang)} />;
}
