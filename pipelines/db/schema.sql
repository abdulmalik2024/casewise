-- Casewise corpus schema — statutes (pipeline #1).
-- Versioning model: one row per (law_id, location_id, active_date).
-- Superseded versions are kept; is_current marks the latest. Point-in-time
-- queries filter on active_date instead.

create table if not exists statute_sections (
    id            bigint generated always as identity primary key,
    law_id        text        not null,                -- e.g. 'RPP'
    location_id   text        not null,                -- e.g. '227', '235-B'
    citation      text        not null,                -- e.g. 'RPP § 227'
    heading       text,
    article_path  text        not null default '',     -- e.g. 'A7 — LANDLORD AND TENANT'
    text          text        not null,
    active_date   date        not null,
    is_current    boolean     not null default true,
    source_url    text        not null,
    source        text        not null default 'openleg_api',  -- or 'nysenate_web' (bootstrap/backup crawl)
    retrieved_at  timestamptz not null default now(),
    unique (law_id, location_id, active_date)
);

create index if not exists statute_sections_current_idx
    on statute_sections (law_id, location_id) where is_current;
