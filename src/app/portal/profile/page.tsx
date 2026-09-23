import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withProfileFeature } from "@/features/directory/server";
import { FileUpload, PrivateImage } from "@/features/private-files/ui/private-file-controls";

export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let profile;
  try { profile = await withProfileFeature((feature) => feature.get({ input: {}, sessionToken, correlationId: crypto.randomUUID() })); }
  catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); throw error; }
  return <main className="mx-auto min-h-svh max-w-3xl space-y-6 px-5 py-10"><Link href="/portal">← Confederation workspace</Link><h1 className="font-serif text-4xl">Your profile</h1>
    <dl className="grid gap-4"><div><dt className="text-sm text-muted-foreground">Full name</dt><dd>{profile.fullName}</dd></div><div><dt className="text-sm text-muted-foreground">Verified email</dt><dd>{profile.email}</dd></div><div><dt className="text-sm text-muted-foreground">Account status</dt><dd>{profile.status}</dd></div><div><dt className="text-sm text-muted-foreground">Birthday</dt><dd>{profile.birthday.month ? new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2000, profile.birthday.month - 1, profile.birthday.day!))) : "Not recorded"}</dd></div></dl>
    <p className="text-sm text-muted-foreground">Full birth dates are restricted to authorized administrators in Birthdays.</p>
    {profile.profileObjectId && <PrivateImage objectId={profile.profileObjectId} alt="Your profile photograph" />}<h2 className="text-xl">Profile photograph</h2><FileUpload purpose="PROFILE_IMAGE" resourceId={profile.id} />
    <h2 className="text-xl">Appointment history</h2><ul className="divide-y">{profile.appointments.map((appointment) => <li key={appointment.id} className="py-4"><p>{appointment.role.replaceAll("_", " ")} · {appointment.university?.name ?? "Confederation"}</p><p className="text-sm text-muted-foreground">{format(appointment.startsAt)} – {appointment.endsAt ? format(appointment.endsAt) : "Ongoing"}</p></li>)}</ul>
  </main>;
}
function format(value: string) { return new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }); }
