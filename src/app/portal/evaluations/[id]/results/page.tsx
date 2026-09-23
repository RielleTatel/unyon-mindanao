import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
export const dynamic = "force-dynamic";
export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let result;
  try { result = await withEvaluationFeature((feature) => feature.results({ input: { id }, sessionToken, correlationId: crypto.randomUUID() })); }
  catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); if (error instanceof AccessError) notFound(); throw error; }
  return <main className="mx-auto min-h-svh max-w-4xl space-y-6 px-5 py-10"><Link href="/portal/evaluations">← Evaluations</Link><h1 className="font-serif text-4xl">Evaluation results</h1>{result.disclosure === "WITHHELD" ? <p>Results are not available until the minimum privacy threshold is met.</p> : <>
    <p>{result.count} responses · {result.disclosure === "ATTRIBUTABLE" ? "Attributable — Super Admin only" : "Anonymized results"}</p><a className="inline-block underline" href={`/api/evaluations/${id}/export`}>Export CSV</a>
    <h2 className="text-xl">Rating averages</h2><ul>{result.ratings.map((rating) => <li className="border-b py-3" key={rating.position}>{result.questions[rating.position].label}: {rating.average.toFixed(2)} / 5</li>)}</ul>
    <h2 className="text-xl">Comments</h2><ul>{result.comments.map((comment, index) => <li className="whitespace-pre-wrap border-b py-3" key={index}><span className="text-sm text-muted-foreground">{result.questions[comment.position].label}</span><p>{comment.comment}</p></li>)}</ul>
    {result.disclosure === "ATTRIBUTABLE" && <><h2 className="text-xl">Individual responses</h2>{result.responses.map((response, index) => <article key={index} className="border-b py-4"><h3>{response.fullName} · {response.email}</h3><ul>{response.answers.map((answer) => <li key={answer.position} className="whitespace-pre-wrap">{result.questions[answer.position].label}: {answer.rating ?? answer.comment}</li>)}</ul></article>)}</>}
  </>}</main>;
}
