import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import {
  Tooltip,
  Box,
  Button,
  SmallIconButton,
  TreeNode,
  TreeRoot,
  TreeNodeLabel,
  PanelTitle,
  Separator,
  TreeSortableItem,
  type TreeDropTarget,
} from "@webstudio-is/design-system";
import {
  ChevronRightIcon,
  FolderIcon,
  HomeIcon,
  EllipsesIcon,
  NewFolderIcon,
  NewPageIcon,
  PageIcon,
  DynamicPageIcon,
  CrossIcon,
} from "@webstudio-is/icons";
import { ExtendedPanel } from "../../shared/extended-sidebar-panel";
import { NewPageSettings, PageSettings } from "./page-settings";
import { $editingPageId, $pages, $selectedPageId } from "~/shared/nano-states";
import { switchPage } from "~/shared/pages";
import { getAllChildrenAndSelf, reparentOrphansMutable } from "./page-utils";
import {
  FolderSettings,
  NewFolderSettings,
  newFolderId,
} from "./folder-settings";
import { serverSyncStore } from "~/shared/sync";
import { useMount } from "~/shared/hook-utils/use-mount";
import { ROOT_FOLDER_ID, type Folder, type Page } from "@webstudio-is/sdk";
import { atom, computed } from "nanostores";
import { isPathnamePattern } from "~/builder/shared/url-pattern";

const ItemSuffix = ({
  isParentSelected,
  itemId,
  editingItemId,
  onEdit,
  type,
}: {
  isParentSelected: boolean;
  itemId: string;
  editingItemId: string | undefined;
  onEdit: (itemId: string | undefined) => void;
  type: "folder" | "page";
}) => {
  const isEditing = editingItemId === itemId;

  const menuLabel =
    type === "page"
      ? isEditing
        ? "Close page settings"
        : "Open page settings"
      : isEditing
        ? "Close folder settings"
        : "Open folder settings";

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const prevEditingItemId = useRef(editingItemId);
  useEffect(() => {
    // when settings panel close, move focus back to the menu button
    if (
      editingItemId === undefined &&
      prevEditingItemId.current === itemId &&
      buttonRef.current
    ) {
      buttonRef.current.focus();
    }
    prevEditingItemId.current = editingItemId;
  }, [editingItemId, itemId]);

  return (
    <Tooltip content={menuLabel} disableHoverableContent>
      <SmallIconButton
        tabIndex={-1}
        aria-label={menuLabel}
        state={isParentSelected ? "open" : undefined}
        onClick={() => onEdit(isEditing ? undefined : itemId)}
        ref={buttonRef}
        // forces to highlight tree node and show action
        aria-current={isEditing}
        icon={isEditing ? <ChevronRightIcon /> : <EllipsesIcon />}
      />
    </Tooltip>
  );
};

const useReparentOrphans = () => {
  useMount(() => {
    // Pages may not be loaded yet when switching betwen projects and the pages
    // panel was already visible - it mounts faster than we load the pages.
    if ($pages.get() === undefined) {
      return;
    }
    serverSyncStore.createTransaction([$pages], (pages) => {
      if (pages === undefined) {
        return;
      }
      reparentOrphansMutable(pages);
    });
  });
};

const isFolder = (id: string, folders: Array<Folder>) => {
  return id === newFolderId || folders.some((folder) => folder.id === id);
};

// We want to keep the state when panel is closed and opened again.
const $expandedItems = atom(new Set<string>());

type PagesTreeItem =
  | {
      id: string;
      level: number;
      isExpanded?: boolean;
      type: "page";
      page: Page;
      isLastChild: boolean;
      dropTarget?: TreeDropTarget;
    }
  | {
      id: string;
      level: number;
      isExpanded?: boolean;
      type: "folder";
      folder: Folder;
      isLastChild: boolean;
      dropTarget?: TreeDropTarget;
    };

type DropTarget = TreeDropTarget & {
  folderId: string;
  closestChildIndex: number;
};

const $dropTarget = atom<undefined | DropTarget>();

const $flatPagesTree = computed(
  [$pages, $expandedItems, $dropTarget],
  (pagesData, expandedItems, dropTarget) => {
    const flatPagesTree: PagesTreeItem[] = [];
    if (pagesData === undefined) {
      return flatPagesTree;
    }
    const folders = new Map(
      pagesData.folders.map((folder) => [folder.id, folder])
    );
    const pages = new Map(pagesData.pages.map((page) => [page.id, page]));
    pages.set(pagesData.homePage.id, pagesData.homePage);
    const traverse = (
      itemId: string,
      level = 0,
      parentId: undefined | string = undefined,
      indexWithinChildren = 0,
      isLastChild = false
    ) => {
      let treeItem: undefined | PagesTreeItem;
      const folder = folders.get(itemId);
      const page = pages.get(itemId);
      if (folder) {
        let isExpanded: undefined | boolean;
        if (level > 0 && folder.children.length > 0) {
          isExpanded = expandedItems.has(folder.id);
        }
        // hide root folder
        if (itemId !== ROOT_FOLDER_ID) {
          treeItem = {
            id: itemId,
            level,
            isExpanded,
            type: "folder",
            folder,
            isLastChild,
          };
          flatPagesTree.push(treeItem);
        }
        if (level === 0 || isExpanded) {
          for (let index = 0; index < folder.children.length; index += 1) {
            const childId = folder.children[index];
            const isLastChild = index === folder.children.length - 1;
            traverse(childId, level + 1, itemId, index, isLastChild);
          }
        }
      }
      if (page) {
        treeItem = {
          id: itemId,
          level,
          type: "page",
          page,
          isLastChild,
        };
        flatPagesTree.push(treeItem);
      }

      if (
        treeItem &&
        dropTarget?.folderId === parentId &&
        dropTarget?.closestChildIndex === indexWithinChildren
      ) {
        treeItem.dropTarget = dropTarget;
      }
    };
    traverse(ROOT_FOLDER_ID);
    return flatPagesTree;
  }
);

const PagesTree = ({
  onSelect,
  selectedPageId,
  onEdit,
  editingItemId,
}: {
  onSelect: (pageId: string) => void;
  selectedPageId: string;
  onEdit: (pageId: string | undefined) => void;
  editingItemId?: string;
}) => {
  const pages = useStore($pages);
  const flatPagesTree = useStore($flatPagesTree);
  useReparentOrphans();

  if (pages === undefined) {
    return null;
  }

  return (
    <Box css={{ overflowY: "auto", flexBasis: 0, flexGrow: 1 }}>
      <TreeRoot>
        {flatPagesTree.map((item, index) => {
          const handleExpand = (isExpanded: boolean, all: boolean) => {
            const expandedItems = new Set($expandedItems.get());
            const items = all
              ? getAllChildrenAndSelf(item.id, pages.folders, "folder")
              : [item.id];
            for (const itemId of items) {
              if (isExpanded) {
                expandedItems.add(itemId);
              } else {
                expandedItems.delete(itemId);
              }
            }
            $expandedItems.set(expandedItems);
          };

          return (
            <TreeSortableItem
              key={item.id}
              level={item.level}
              isExpanded={item.isExpanded}
              isLastChild={item.isLastChild}
              data={item}
              canDrag={() => true}
              dropTarget={item.dropTarget}
              onDropTargetChange={(dropTarget, draggingItem) => {
                /*
                const builderDropTarget = getBuilderDropTarget(
                  item.selector,
                  dropTarget
                );
                if (
                  builderDropTarget &&
                  canDrop(draggingItem.selector, builderDropTarget.itemSelector)
                ) {
                  $dragAndDropState.set({
                    ...$dragAndDropState.get(),
                    isDragging: true,
                    dragPayload: {
                      origin: "panel",
                      type: "reparent",
                      dragInstanceSelector: draggingItem.selector,
                    },
                    dropTarget: builderDropTarget,
                  });
                } else {
                  $dragAndDropState.set({
                    ...$dragAndDropState.get(),
                    isDragging: false,
                    dropTarget: undefined,
                  });
                }
                */
              }}
              onDrop={(data) => {
                /*
                const builderDropTarget = $dragAndDropState.get().dropTarget;
                if (builderDropTarget) {
                  reparentInstance(data.selector, {
                    parentSelector: builderDropTarget.itemSelector,
                    position: builderDropTarget.indexWithinChildren,
                  });
                }
                $dragAndDropState.set({ isDragging: false });
                */
              }}
              onExpand={(isExpanded) => handleExpand(isExpanded, false)}
            >
              <TreeNode
                level={item.level}
                tabbable={index === 0}
                isSelected={item.id === selectedPageId}
                isExpanded={item.isExpanded}
                onExpand={handleExpand}
                buttonProps={{
                  onClick: (event) => {
                    if (item.type === "folder") {
                      handleExpand(item.isExpanded === false, event.altKey);
                    }
                    if (item.type === "page") {
                      onSelect(item.id);
                    }
                  },
                }}
                action={
                  <ItemSuffix
                    type={item.type}
                    isParentSelected={item.id === selectedPageId}
                    itemId={item.id}
                    editingItemId={editingItemId}
                    onEdit={onEdit}
                  />
                }
              >
                {item.type === "folder" && (
                  <TreeNodeLabel prefix={<FolderIcon />}>
                    {item.folder.name}
                  </TreeNodeLabel>
                )}
                {item.type === "page" && (
                  <TreeNodeLabel
                    prefix={
                      item.id === pages?.homePage.id ? (
                        <HomeIcon />
                      ) : isPathnamePattern(item.page.path) ? (
                        <DynamicPageIcon />
                      ) : (
                        <PageIcon />
                      )
                    }
                  >
                    {item.page.name}
                  </TreeNodeLabel>
                )}
              </TreeNode>
            </TreeSortableItem>
          );
        })}
      </TreeRoot>
    </Box>
  );
};

const newPageId = "new-page";

const PageEditor = ({
  editingPageId,
  setEditingPageId,
}: {
  editingPageId: string;
  setEditingPageId: (pageId?: string) => void;
}) => {
  const currentPageId = useStore($selectedPageId);

  if (editingPageId === newPageId) {
    return (
      <NewPageSettings
        onClose={() => setEditingPageId(undefined)}
        onSuccess={(pageId) => {
          setEditingPageId(undefined);
          switchPage(pageId);
        }}
      />
    );
  }

  return (
    <PageSettings
      onClose={() => setEditingPageId(undefined)}
      onDelete={() => {
        setEditingPageId(undefined);
        // switch to home page when deleted currently selected page
        if (editingPageId === currentPageId) {
          const pages = $pages.get();
          if (pages) {
            switchPage(pages.homePage.id);
          }
        }
      }}
      onDuplicate={(newPageId) => {
        setEditingPageId(undefined);
        switchPage(newPageId);
      }}
      pageId={editingPageId}
      key={editingPageId}
    />
  );
};

const FolderEditor = ({
  editingFolderId,
  setEditingFolderId,
}: {
  editingFolderId: string;
  setEditingFolderId: (pageId?: string) => void;
}) => {
  if (editingFolderId === newFolderId) {
    return (
      <NewFolderSettings
        onClose={() => setEditingFolderId(undefined)}
        onSuccess={() => {
          setEditingFolderId(undefined);
        }}
        key={newFolderId}
      />
    );
  }

  return (
    <FolderSettings
      onClose={() => setEditingFolderId(undefined)}
      onDelete={() => {
        setEditingFolderId(undefined);
      }}
      folderId={editingFolderId}
      key={editingFolderId}
    />
  );
};

export const PagesPanel = ({ onClose }: { onClose: () => void }) => {
  const currentPageId = useStore($selectedPageId);
  const editingItemId = useStore($editingPageId);
  const pages = useStore($pages);

  if (currentPageId === undefined || pages === undefined) {
    return;
  }

  return (
    <>
      <PanelTitle
        suffix={
          <>
            <Tooltip content="New folder" side="bottom">
              <Button
                onClick={() => {
                  $editingPageId.set(
                    editingItemId === newFolderId ? undefined : newFolderId
                  );
                }}
                aria-label="New folder"
                prefix={<NewFolderIcon />}
                color="ghost"
              />
            </Tooltip>
            <Tooltip content="New page" side="bottom">
              <Button
                onClick={() => {
                  $editingPageId.set(
                    editingItemId === newPageId ? undefined : newPageId
                  );
                }}
                aria-label="New page"
                prefix={<NewPageIcon />}
                color="ghost"
              />
            </Tooltip>
            <Tooltip content="Close panel" side="bottom">
              <Button
                color="ghost"
                prefix={<CrossIcon />}
                aria-label="Close panel"
                onClick={onClose}
              />
            </Tooltip>
          </>
        }
      >
        Pages
      </PanelTitle>
      <Separator />

      <PagesTree
        selectedPageId={currentPageId}
        onSelect={(itemId) => {
          switchPage(itemId);
          onClose();
        }}
        editingItemId={editingItemId}
        onEdit={$editingPageId.set}
      />

      <ExtendedPanel isOpen={editingItemId !== undefined}>
        {editingItemId !== undefined && (
          <>
            {isFolder(editingItemId, pages.folders) ? (
              <FolderEditor
                editingFolderId={editingItemId}
                setEditingFolderId={$editingPageId.set}
              />
            ) : (
              <PageEditor
                editingPageId={editingItemId}
                setEditingPageId={$editingPageId.set}
              />
            )}
          </>
        )}
      </ExtendedPanel>
    </>
  );
};
