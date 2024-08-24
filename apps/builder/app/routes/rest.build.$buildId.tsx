import { json, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { findPageByIdOrPath } from "@webstudio-is/sdk";
import type { Data } from "@webstudio-is/http-client";
import type { AppContext } from "@webstudio-is/trpc-interface/index.server";
import { loadBuildById } from "@webstudio-is/project-build/index.server";
import { db as projectDb } from "@webstudio-is/project/index.server";
import { loadAssetsByProject } from "@webstudio-is/asset-uploader/index.server";
import { db as domainDb } from "@webstudio-is/domain/index.server";
import { createContext } from "~/shared/context.server";
import { getUserById, type User } from "~/shared/db/user.server";

const loadProductionCanvasData = async (
  buildId: string,
  context: AppContext
): Promise<Data> => {
  const build = await loadBuildById(context, buildId);

  if (build === undefined) {
    throw new Error("The project is not published");
  }

  const { deployment } = build;

  if (deployment === undefined) {
    throw new Error("The project is not published");
  }

  const currentProjectDomainsResult = await domainDb.findMany(
    { projectId: build.projectId },
    context
  );

  if (currentProjectDomainsResult.success === false) {
    throw new Error(currentProjectDomainsResult.error);
  }

  const currentProjectDomains = currentProjectDomainsResult.data;

  // Check that build deployment domains are still active and verified
  // for examle: redeploy created few days later
  const domains =
    deployment.destination === "static"
      ? []
      : deployment.domains.filter((domain) =>
          currentProjectDomains.some(
            (projectDomain) =>
              projectDomain.domain.domain === domain &&
              projectDomain.domain.status === "ACTIVE" &&
              projectDomain.verified
          )
        );

  const page = findPageByIdOrPath("/", build.pages);

  if (page === undefined) {
    throw new Error(`Page / not found`);
  }

  const allAssets = await loadAssetsByProject(build.projectId, context);

  const canvasData = {
    build: {
      ...build,
      deployment: {
        ...deployment,
        domains,
      },
    },
    page,
    pages: [build.pages.homePage, ...build.pages.pages],
  };

  const styles = canvasData.build?.styles ?? [];

  // Find all fonts referenced in styles
  const fontFamilySet = new Set<string>();
  for (const [, { value }] of styles) {
    if (value.type === "fontFamily") {
      for (const fontFamily of value.value) {
        fontFamilySet.add(fontFamily);
      }
    }
  }

  // Filter unused font assets
  const assets = allAssets.filter(
    (asset) =>
      asset.type === "image" ||
      (asset.type === "font" && fontFamilySet.has(asset.meta.family))
  );

  return {
    ...canvasData,
    assets,
  };
};

export const loader = async ({
  params,
  request,
}: LoaderFunctionArgs): Promise<
  Data & { user: { email: User["email"] } | undefined } & {
    projectDomain: string;
    projectTitle: string;
  }
> => {
  try {
    const buildId = params.buildId;

    if (buildId === undefined) {
      throw json("Required build id", { status: 400 });
    }

    const context = await createContext(request);

    const pagesCanvasData = await loadProductionCanvasData(buildId, context);

    const project = await projectDb.project.loadById(
      pagesCanvasData.build.projectId,
      context
    );

    const user =
      project === null || project.userId === null
        ? undefined
        : await getUserById(project.userId);

    return {
      ...pagesCanvasData,
      user: user ? { email: user.email } : undefined,
      projectDomain: project.domain,
      projectTitle: project.title,
    };
  } catch (error) {
    // If a Response is thrown, we're rethrowing it for Remix to handle.
    // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
    if (error instanceof Response) {
      throw error;
    }

    console.error({ error });

    // We have no idea what happened, so we'll return a 500 error.
    throw json(error instanceof Error ? error.message : String(error), {
      status: 500,
    });
  }
};
