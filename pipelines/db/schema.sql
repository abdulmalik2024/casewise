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

-- Case law (pipeline #2) — NY Official Reports slip opinions via RSS.
create table if not exists case_decisions (
    id             bigint generated always as identity primary key,
    case_name      text        not null,
    url            text        not null unique,
    slip_citation  text,                     -- e.g. '2026 NY Slip Op 26174'
    court          text,                     -- e.g. 'Supreme Court, New York County'
    decided_date   date,
    feed_code      text,                     -- RSS feed that surfaced it (COA, AT1, misc, ...)
    text           text        not null,
    retrieved_at   timestamptz not null default now()
);

create index if not exists case_decisions_decided_idx on case_decisions (decided_date desc);

-- Embedded retrieval chunks (RAG corpus), built from the source tables.
create extension if not exists vector;

create table if not exists chunks (
    id           bigint generated always as identity primary key,
    source_type  text    not null,             -- 'statute' | 'case'
    source_id    bigint  not null,             -- statute_sections.id / case_decisions.id
    chunk_index  int     not null default 0,
    citation     text    not null,             -- e.g. 'RPP § 235-B' / '2026 NY Slip Op 26174'
    heading      text,
    text         text    not null,
    embedding    vector(1024),
    embed_model  text,
    created_at   timestamptz not null default now(),
    unique (source_type, source_id, chunk_index)
);
