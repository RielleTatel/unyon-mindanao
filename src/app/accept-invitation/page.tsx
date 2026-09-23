import type { Metadata } from "next";

import { InvitationAcceptance } from "@/features/directory/ui/invitation-acceptance";

export const metadata: Metadata = {
  title: "Accept invitation | Unyon Mindanao Portal",
  robots: { index: false, follow: false },
};

export default function AcceptInvitationPage() {
  return <InvitationAcceptance />;
}
