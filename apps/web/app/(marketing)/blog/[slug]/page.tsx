import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS } from "../posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.keywords,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      url: `https://casewise.si/blog/${post.slug}`,
    },
  };
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <p className="pt-10 text-xs text-[#a39f8d]">
        <Link href="/blog" className="hover:underline">
          ← Blog
        </Link>{" "}
        · {post.date}
      </p>
      <h1 className="mt-2 text-3xl leading-snug tracking-tight [font-family:var(--font-serif)]">
        {post.title}
      </h1>
      <div className="mt-6 space-y-5 leading-relaxed text-[#5d5848] dark:text-neutral-300">
        {post.body.map((para, i) =>
          para.startsWith("## ") ? (
            <h2
              key={i}
              className="pt-2 text-xl tracking-tight text-[#3d3929] [font-family:var(--font-serif)] dark:text-neutral-100"
            >
              {para.slice(3)}
            </h2>
          ) : (
            <p key={i}>{para}</p>
          )
        )}
      </div>
      <div className="mt-10">
        <Link
          href="/app"
          className="rounded-full bg-[#1e3a5a] px-7 py-3 font-medium text-white hover:bg-[#16304b]"
        >
          Try 5 questions free
        </Link>
      </div>
    </main>
  );
}
