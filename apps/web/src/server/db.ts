import "server-only";
import "./env"; // garante o .env da raiz carregado antes do Prisma conectar

export { prisma } from "@mais/db";
