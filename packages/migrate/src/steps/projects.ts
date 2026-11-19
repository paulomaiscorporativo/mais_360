import { cleanText, foldText, projectTemplate, type ProjectFeature } from "@mais/core";
import type { Prisma } from "@mais/db";
import { idOf, importFile, keyOf, on, type Ctx } from "../context";
import { PROJECT_STATUS, PROJECT_TYPE, calendarNoon, convert, hexColor, instant } from "../rules";

/** Projetos (Trip), recursos ligados, grupos, categorias e acesso da equipe. */
export async function migrateProjects(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;
  const trips = src.rows("Trip");
  const countBy = (table: Parameters<typeof src.rows>[0]) => {
    const m = new Map<string, number>();
    for (const r of src.rows(table)) m.set(r.str("tripId"), (m.get(r.str("tripId")) ?? 0) + 1);
    return m;
  };
  const usage: Partial<Record<ProjectFeature, Map<string, number>>> = {
    FLIGHTS: countBy("Flight"),
    ACCOMMODATION: countBy("Accommodation"),
    ITINERARY: countBy("ItineraryItem"),
    CHECKLIST: countBy("ChecklistItem"),
    MURAL: countBy("MuralPost"),
    SUPPORT: countBy("Ticket"),
    DOCUMENTS: countBy("TripDocument"),
    VOUCHERS: countBy("VoucherTemplate"),
  };

  for (const t of trips) {
    const tripId = t.str("id");
    const type = convert(PROJECT_TYPE, t.str("kind"), "INCENTIVE_TRIP");
    const id = idOf(ctx, "Trip", tripId);
    ctx.maps.projects.set(tripId, {
      id,
      tz: tenant.timezone,
      isEvent: type.value === "CORPORATE_EVENT",
      name: t.str("name"),
    });
    report.read("Project");
    if (!type.known)
      report.warn("LOSSY_CONVERSION", "Trip", tripId, `Tipo "${type.raw}" → viagem de incentivo.`);
    if (!on(ctx, "projetos")) continue;

    const status = convert(PROJECT_STATUS, t.str("status"), "PLANNING");
    if (!status.known)
      report.warn("LOSSY_CONVERSION", "Trip", tripId, `Status "${status.raw}" → PLANNING.`);

    const before = await tx.project.findUnique({ where: { id } });

    let slug = cleanText(t.str("slug")).toLowerCase() || `projeto-${tripId.slice(-6)}`;
    const slugOwner = await tx.project.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      select: { id: true },
    });
    if (slugOwner && slugOwner.id !== id) {
      slug = `${slug}-legado`;
      report.warn(
        "CONFLICT",
        "Trip",
        tripId,
        `Endereço já usado no cliente: gravado como "${slug}".`,
      );
    }
    let publicToken: string | undefined = t.str("formToken").trim() || undefined;
    if (publicToken) {
      const owner = await tx.project.findUnique({ where: { publicToken }, select: { id: true } });
      if (owner && owner.id !== id) {
        report.warn(
          "CONFLICT",
          "Trip",
          tripId,
          "Token do formulário já usado por outro projeto: link antigo /f/<token> não valerá.",
        );
        publicToken = undefined;
      }
    }

    const file = (col: string, label: string) =>
      importFile(ctx, {
        entity: `Trip.${col}`,
        legacyId: tripId,
        relPath: t.str(col),
        visibility: "PUBLIC",
        fileName: `${label}-${slug}`,
      });
    const logoFileId = await file("logoPath", "logo");
    const bannerFileId = await file("bannerPath", "banner");
    const letterheadFileId = await file("letterheadPath", "timbrado");
    const inviteBannerFileId = await file("inviteBannerPath", "banner-convite");

    const primary = hexColor(t.str("primaryColor"));
    const secondary = hexColor(t.str("secondaryColor"));
    const prevSettings =
      before?.settings && typeof before.settings === "object" && !Array.isArray(before.settings)
        ? (before.settings as Record<string, unknown>)
        : {};
    const prevForm =
      prevSettings.form && typeof prevSettings.form === "object"
        ? (prevSettings.form as Record<string, unknown>)
        : {};
    const settings = {
      ...prevSettings,
      form: {
        ...prevForm,
        open: t.bool("formOpen", true),
        welcome: t.str("formWelcome").slice(0, 2000),
      },
      legado: {
        chave: keyOf(ctx, "Trip", tripId),
        allowCompanion: t.bool("allowCompanion", true),
        showAgencyLogo: t.bool("showAgencyLogo", true),
        inviteBannerFileId,
      },
    };

    const data = {
      type: type.value,
      status: status.value,
      name: cleanText(t.str("name")) || "Projeto sem nome",
      slug,
      description: t.str("description"),
      startsAt: calendarNoon(t.date("startDate")),
      endsAt: calendarNoon(t.date("endDate")),
      venueName: t.str("venueName"),
      venueAddress: t.str("venueAddress"),
      destination: t.str("destination"),
      logoFileId: logoFileId ?? before?.logoFileId ?? null,
      bannerFileId: bannerFileId ?? inviteBannerFileId ?? before?.bannerFileId ?? null,
      letterheadFileId: letterheadFileId ?? before?.letterheadFileId ?? null,
      primaryColor: primary && primary !== tenant.primaryColor.toLowerCase() ? primary : null,
      secondaryColor:
        secondary && secondary !== tenant.secondaryColor.toLowerCase() ? secondary : null,
      settings: settings as Prisma.InputJsonValue,
      archivedAt: status.value === "ARCHIVED" ? (instant(t.date("updatedAt")) ?? new Date()) : null,
      ...(publicToken ? { publicToken } : {}),
    };
    if (bannerFileId && inviteBannerFileId && bannerFileId !== inviteBannerFileId)
      report.warn(
        "REVIEW",
        "Trip",
        tripId,
        "Arte do e-mail de convite diferente do banner: guardada em settings.legado.inviteBannerFileId.",
      );
    if (cleanText(t.str("clientName")) && foldText(t.str("clientName")) !== foldText(tenant.name))
      report.warn(
        "REVIEW",
        "Trip",
        tripId,
        `Cliente informado no legado ("${cleanText(t.str("clientName"))}") difere do cliente de destino (${tenant.name}).`,
      );

    if (before) await tx.project.update({ where: { id }, data });
    else
      await tx.project.create({
        data: {
          id,
          tenantId: tenant.id,
          createdAt: instant(t.date("createdAt")) ?? undefined,
          ...data,
        },
      });
    report.saved("Project", !!before);

    // Recursos: o modelo da tipologia + o que o legado usava de fato
    const features = new Map<ProjectFeature, boolean>();
    for (const f of projectTemplate(type.value).features) features.set(f, true);
    for (const [f, m] of Object.entries(usage) as [ProjectFeature, Map<string, number>][])
      if ((m.get(tripId) ?? 0) > 0) features.set(f, true);
    features.set("REGISTRATION_FORM", t.bool("formOpen", true));
    const invites = t.bool("invitesEnabled", false);
    features.set("INVITES", invites);
    features.set("TABLES", invites && t.bool("tablesEnabled", true));
    for (const [feature, enabled] of features) {
      await tx.projectFeatureToggle.upsert({
        where: { projectId_feature: { projectId: id, feature } },
        create: { projectId: id, feature, enabled },
        update: { enabled },
      });
    }
  }

  // Grupos
  for (const g of src.rows("TripGroup")) {
    report.read("ProjectGroup");
    const project = ctx.maps.projects.get(g.str("tripId"));
    if (!project) {
      report.skipped("ProjectGroup");
      continue;
    }
    const id = idOf(ctx, "TripGroup", g.str("id"));
    ctx.maps.groups.set(g.str("id"), id);
    ctx.maps.groupsByName.set(`${g.str("tripId")}:${foldText(g.str("name"))}`, id);
    if (!on(ctx, "projetos")) continue;
    const before = await tx.projectGroup.findUnique({ where: { id }, select: { id: true } });
    const data = {
      name: cleanText(g.str("name")) || "Grupo",
      color: hexColor(g.str("color")) || "#64748b",
    };
    await tx.projectGroup.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId: project.id, ...data },
      update: data,
    });
    report.saved("ProjectGroup", !!before);
  }

  // Categorias: uma por valor distinto de Passenger.category no projeto
  const order = new Map<string, number>();
  for (const p of src.rows("Passenger")) {
    const name = cleanText(p.str("category"));
    const project = ctx.maps.projects.get(p.str("tripId"));
    if (!name || !project) continue;
    const mapKey = `${p.str("tripId")}:${foldText(name)}`;
    if (ctx.maps.categories.has(mapKey)) continue;
    const id = idOf(ctx, "Category", mapKey);
    ctx.maps.categories.set(mapKey, id);
    report.read("RegistrationCategory");
    if (!on(ctx, "projetos")) continue;
    const sortOrder = order.get(project.id) ?? 0;
    order.set(project.id, sortOrder + 1);
    const before = await tx.registrationCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    const byName = await tx.registrationCategory.findUnique({
      where: { projectId_name: { projectId: project.id, name } },
      select: { id: true },
    });
    if (byName && byName.id !== id) {
      ctx.maps.categories.set(mapKey, byName.id);
      report.updated("RegistrationCategory");
      continue;
    }
    await tx.registrationCategory.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId: project.id, name, sortOrder },
      update: { name },
    });
    report.saved("RegistrationCategory", !!before);
  }

  // Acesso da equipe a projetos específicos (allTrips = false)
  for (const a of src.rows("UserTripAccess")) {
    report.read("ProjectAccess");
    const userId = ctx.maps.users.get(a.str("userId"));
    const project = ctx.maps.projects.get(a.str("tripId"));
    if (!on(ctx, "projetos")) continue;
    if (!userId || !project) {
      report.skipped("ProjectAccess");
      continue;
    }
    const m = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { id: true },
    });
    if (!m) {
      report.skipped("ProjectAccess");
      report.warn(
        "MISSING_REFERENCE",
        "UserTripAccess",
        a.str("userId"),
        "Usuário sem vínculo com o cliente (rode a etapa nucleo).",
      );
      continue;
    }
    const before = await tx.projectAccess.findUnique({
      where: { membershipId_projectId: { membershipId: m.id, projectId: project.id } },
    });
    await tx.projectAccess.upsert({
      where: { membershipId_projectId: { membershipId: m.id, projectId: project.id } },
      create: { membershipId: m.id, projectId: project.id },
      update: {},
    });
    report.saved("ProjectAccess", !!before);
  }
}
