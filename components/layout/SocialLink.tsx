"use client";

import type { AnchorHTMLAttributes } from 'react';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { socialDestination, type SocialService } from '@/lib/social-links';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & { service: SocialService };

export function SocialLink({ service, ...props }: Props) {
  const device = useDeviceProfile();
  const destination = socialDestination(service, device);
  return <a {...props} {...destination} rel="noopener noreferrer" />;
}
