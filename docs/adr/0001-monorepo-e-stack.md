# ADR 0001 — Monorepo e stack

**Status:** aceita · 18/11/2026

## Contexto
Cinco sistemas com quatro stacks (Next/Prisma, Express/SQLite, React/Vite/Express, Express/MySQL).
O mais maduro (ABIEC) é Next.js 16 + TypeScript + Prisma.

## Decisão
Monorepo com npm workspaces: `apps/web` (Next.js 16), `apps/worker`, `packages/db` (Prisma +
PostgreSQL), `packages/core` (regras puras). Os demais sistemas são **portados** para esta stack,
não integrados como serviços separados.

## Consequências
Uma linguagem, um banco, um deploy. O custo é reescrever partes do credenciamento (React/JS) e do
sistema de convites (Express/JS) — o que também corrige seus problemas estruturais.
