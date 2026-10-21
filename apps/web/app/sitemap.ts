import type { MetadataRoute } from "next";
import { POSTS } from "./(marketing)/blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://casewise.si";
  const pages = [
    { path: "", priority: 1.0 },
    { path: "/how-it-works", priority: 0.9 },
    { path: "/features", priority: 0.9 },
    { path: "/who-its-for", priority: 0.8 },
    { path: "/pricing", priority: 0.9 },
    { path: "/blog", priority: 0.7 },
    { path: "/about", priority: 0.5 },
  ].map((p) => ({
    url: `${base}${p.path}`,
    lastModified: new Date(),
    priority: p.priority,
  }));
  const posts = POSTS.map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    priority: 0.7,
  }));
  return [...pages, ...posts];
}
