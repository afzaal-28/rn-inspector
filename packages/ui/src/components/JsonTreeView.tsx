import { useState, useCallback, memo, useEffect, type MouseEvent } from "react";
import {
  Box,
  IconButton,
  Typography,
  Collapse,
  TextField,
  Button,
  Popper,
  Paper,
  ClickAwayListener,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";

type JsonTreeViewProps = {
  data: unknown;
  name?: string;
  defaultExpanded?: boolean;
  depth?: number;
  maxDepth?: number;
  searchQuery?: string;
  parentPath?: string[];
  parentValue?: unknown;
  storageTarget?: "asyncStorage" | "redux";
  onMutate?: (payload: {
    target: "asyncStorage" | "redux";
    op: "set" | "delete";
    path: string | string[];
    value?: unknown;
  }) => void;
};

const getValueColor = (value: unknown): string => {
  if (value === null) return "#808080";
  if (value === undefined) return "#808080";
  if (typeof value === "string") return "#ce9178";
  if (typeof value === "number") return "#b5cea8";
  if (typeof value === "boolean") return "#569cd6";
  return "inherit";
};

const getTypeLabel = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") return `Object`;
  return typeof value;
};

const formatValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value);
};

const parseInputValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
};

const buildPath = (
  parentPath: string[] | undefined,
  name?: string,
): string[] => {
  const base = parentPath ? [...parentPath] : [];
  if (!name) return base;
  const indexMatch = name.match(/^\[(\d+)\]$/);
  const normalizedName = indexMatch ? indexMatch[1] : name;
  return [...base, normalizedName];
};

const formatPathLabel = (pathParts: string[]): string => {
  if (!pathParts.length) return "<root>";
  return pathParts
    .map((part, index) => {
      if (/^\d+$/.test(part)) return `[${part}]`;
      const safeKey = part.replace(/"/g, '\\"');
      const isSimple = /^[A-Za-z_$][\w$]*$/.test(part);
      if (index === 0) return isSimple ? part : `["${safeKey}"]`;
      return isSimple ? `.${part}` : `["${safeKey}"]`;
    })
    .join("");
};

const isExpandable = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
};

const JsonTreeNode = memo(function JsonTreeNode({
  data,
  name,
  defaultExpanded = false,
  depth = 0,
  maxDepth = 10,
  searchQuery = "",
  parentPath,
  parentValue,
  storageTarget,
  onMutate,
}: JsonTreeViewProps) {
  const q = searchQuery.trim().toLowerCase();

  const hasMatch = useCallback(
    (value: unknown, keyName?: string): boolean => {
      if (!q) return false;

      if (typeof keyName === "string" && keyName.toLowerCase().includes(q))
        return true;

      if (value === null || value === undefined) return false;
      const t = typeof value;
      if (t === "string") return (value as string).toLowerCase().includes(q);
      if (t === "number" || t === "boolean" || t === "bigint")
        return String(value).toLowerCase().includes(q);
      if (Array.isArray(value)) return value.some((item) => hasMatch(item));
      if (t === "object")
        return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
          hasMatch(v, k),
        );
      return false;
    },
    [q],
  );

  const expandable = isExpandable(data);
  const selfOrDescendantMatch = q ? hasMatch(data, name) : false;

  const [expanded, setExpanded] = useState(
    (defaultExpanded && depth < 2) || selfOrDescendantMatch,
  );
  const [editingValue, setEditingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [editAnchorEl, setEditAnchorEl] = useState<HTMLElement | null>(null);
  const [addAnchorEl, setAddAnchorEl] = useState<HTMLElement | null>(null);
  const [addMode, setAddMode] = useState<"child" | "sibling" | null>(null);
  const [childKeyDraft, setChildKeyDraft] = useState("");
  const [childValueDraft, setChildValueDraft] = useState("");
  const [siblingValueDraft, setSiblingValueDraft] = useState("");
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const currentPath = buildPath(parentPath, name);
  const currentPathLabel = formatPathLabel(currentPath);
  const canMutate = Boolean(
    onMutate && storageTarget && (name !== undefined || depth === 0),
  );
  const canDelete = depth > 0;
  const isArrayItem = Array.isArray(parentValue);

  useEffect(() => {
    if (!q) {
      setExpanded(defaultExpanded && depth < 2);
    } else if (selfOrDescendantMatch) {
      setExpanded(true);
    }
  }, [q, selfOrDescendantMatch, defaultExpanded, depth]);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleEditStart = (event: MouseEvent) => {
    event.stopPropagation();
    setValueDraft(JSON.stringify(data, null, 2));
    setEditingValue(true);
    setEditAnchorEl(event.currentTarget as HTMLElement);
  };

  const handleEditClose = () => {
    setEditingValue(false);
    setEditAnchorEl(null);
  };

  const handleDelete = (event: MouseEvent) => {
    event.stopPropagation();
    if (!canDelete) return;
    setDeleteAnchorEl(event.currentTarget as HTMLElement);
    setConfirmingDelete(true);
  };

  const handleDeleteCancel = () => {
    setConfirmingDelete(false);
    setDeleteAnchorEl(null);
  };

  const handleDeleteConfirm = () => {
    if (!onMutate || !storageTarget || !currentPath.length || !canDelete) return;
    onMutate({ target: storageTarget, op: "delete", path: currentPath });
    handleDeleteCancel();
  };

  const handleAddChild = (event: MouseEvent) => {
    event.stopPropagation();
    setAddMode("child");
    setAddAnchorEl(event.currentTarget as HTMLElement);
    setChildKeyDraft("");
    setChildValueDraft("");
    setExpanded(true);
  };

  const handleAddSave = () => {
    if (!onMutate || !storageTarget) return;
    const isArray = Array.isArray(data);
    let childPath: string[] = [];
    if (isArray) {
      const nextIndex = Array.isArray(data) ? data.length : 0;
      childPath = [...currentPath, String(nextIndex)];
    } else {
      if (!childKeyDraft.trim()) return;
      childPath = [...currentPath, childKeyDraft.trim()];
    }
    onMutate({
      target: storageTarget,
      op: "set",
      path: childPath,
      value: parseInputValue(childValueDraft),
    });
    setAddMode(null);
    setAddAnchorEl(null);
  };

  const handleAddSibling = (event: MouseEvent) => {
    event.stopPropagation();
    setAddMode("sibling");
    setAddAnchorEl(event.currentTarget as HTMLElement);
    setSiblingValueDraft("");
  };

  const handleSiblingSave = () => {
    if (!onMutate || !storageTarget || !isArrayItem) return;
    const parentArray = Array.isArray(parentValue) ? [...parentValue] : null;
    if (!parentArray) return;
    const nameMatch =
      (name || "").match(/^(\d+)$/) || (name || "").match(/^\[(\d+)\]$/);
    const index = nameMatch ? Number(nameMatch[1]) : null;
    if (index === null || Number.isNaN(index)) return;
    parentArray.splice(index, 0, parseInputValue(siblingValueDraft));
    const parentArrayPath = parentPath || [];
    onMutate({
      target: storageTarget,
      op: "set",
      path: parentArrayPath,
      value: parentArray,
    });
    setAddMode(null);
    setAddAnchorEl(null);
  };

  const handleEditSave = () => {
    if (!onMutate || !storageTarget) return;
    onMutate({
      target: storageTarget,
      op: "set",
      path: currentPath,
      value: parseInputValue(valueDraft),
    });
    handleEditClose();
  };

  const editPopper = (
    <Popper
      open={editingValue && Boolean(editAnchorEl)}
      anchorEl={editAnchorEl}
      placement="bottom-start"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{ zIndex: 1300 }}
    >
      <ClickAwayListener onClickAway={handleEditClose}>
        <Paper
          elevation={6}
          sx={{
            p: 1.5,
            minWidth: 280,
            maxWidth: 360,
            borderRadius: 1.5,
            background: (theme) => theme.palette.background.paper,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <TextField
            size="small"
            label="Value (JSON)"
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            multiline
            minRows={3}
            sx={{ minWidth: 260, mt: 1 }}
            helperText={
              <Box
                component="span"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                Path: {currentPathLabel}
              </Box>
            }
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
            <Button size="small" variant="text" onClick={handleEditSave}>
              Save
            </Button>
            <Button size="small" variant="text" onClick={handleEditClose}>
              Cancel
            </Button>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );

  const addPopper = (
    <Popper
      open={Boolean(addMode) && Boolean(addAnchorEl)}
      anchorEl={addAnchorEl}
      placement="bottom-start"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{ zIndex: 1300 }}
    >
      <ClickAwayListener
        onClickAway={() => {
          setAddMode(null);
          setAddAnchorEl(null);
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 1.5,
            minWidth: 280,
            maxWidth: 360,
            borderRadius: 1.5,
            background: (theme) => theme.palette.background.paper,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {addMode === "child" && !Array.isArray(data) && (
              <TextField
                size="small"
                label="Key"
                placeholder="e.g. settings"
                value={childKeyDraft}
                onChange={(e) => setChildKeyDraft(e.target.value)}
                sx={{ minWidth: 180 }}
              />
            )}
            <TextField
              size="small"
              label="Value (JSON)"
              placeholder='"hello", 123, { "a": 1 }'
              value={addMode === "sibling" ? siblingValueDraft : childValueDraft}
              onChange={(e) =>
                addMode === "sibling"
                  ? setSiblingValueDraft(e.target.value)
                  : setChildValueDraft(e.target.value)
              }
              helperText={
                <Box
                  component="span"
                  sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  Parent: {
                    addMode === "sibling"
                      ? formatPathLabel(parentPath ? [...parentPath] : [])
                      : formatPathLabel(currentPath)
                  }
                </Box>
              }
              multiline
              minRows={3}
              sx={{ minWidth: 260 }}
            />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button
                size="small"
                variant="text"
                onClick={addMode === "sibling" ? handleSiblingSave : handleAddSave}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setAddMode(null);
                  setAddAnchorEl(null);
                }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );

  const deletePopper = (
    <Popper
      open={confirmingDelete && Boolean(deleteAnchorEl)}
      anchorEl={deleteAnchorEl}
      placement="bottom-start"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{ zIndex: 1300 }}
    >
      <ClickAwayListener onClickAway={handleDeleteCancel}>
        <Paper
          elevation={6}
          sx={{
            p: 1.5,
            minWidth: 260,
            maxWidth: 360,
            borderRadius: 1.5,
            background: (theme) => theme.palette.background.paper,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            Delete {currentPathLabel || "item"}?
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button size="small" color="error" variant="text" onClick={handleDeleteConfirm}>
              Delete
            </Button>
            <Button size="small" variant="text" onClick={handleDeleteCancel}>
              Cancel
            </Button>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );


  if (depth > maxDepth) {
    return (
      <Typography
        component="span"
        sx={{ fontFamily: "monospace", fontSize: 12, color: "#808080" }}
      >
        [Max depth exceeded]
      </Typography>
    );
  }

  // Render primitive values
  if (!expandable) {
    return (
      <>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            pl: depth > 0 ? 2.5 : 0,
            py: 0.25,
          }}
        >
          {name !== undefined && (
            <>
              <Typography
                component="span"
                sx={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#9cdcfe",
                  backgroundColor:
                    q && name?.toLowerCase().includes(q)
                      ? "rgba(255, 193, 7, 0.25)"
                      : "transparent",
                }}
              >
                {name}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "text.secondary",
                }}
              >
                :
              </Typography>
            </>
          )}
          <Typography
            component="span"
            sx={{
              fontFamily: "monospace",
              fontSize: 12,
              color: getValueColor(data),
              backgroundColor:
                q &&
                typeof data === "string" &&
                data.toLowerCase().includes(q)
                  ? "rgba(255, 193, 7, 0.25)"
                  : "transparent",
              wordBreak: "break-word",
              opacity: editingValue ? 0.4 : 1,
            }}
          >
            {formatValue(data)}
          </Typography>
          {canMutate && (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1 }}
            >
              <IconButton
                size="small"
                onClick={handleEditStart}
                disabled={editingValue}
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
              {isArrayItem && (
                <IconButton
                  size="small"
                  onClick={handleAddSibling}
                  disabled={editingValue}
                >
                  <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              {canDelete && (
                <IconButton size="small" onClick={handleDelete} disabled={editingValue}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          )}
        </Box>
        {editingValue ? editPopper : null}
        {deletePopper}
        {addPopper}
      </>
    );
  }

  // Render expandable objects/arrays
  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(data as Record<string, unknown>);

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          "&:hover": { backgroundColor: "action.hover" },
          borderRadius: 1,
          py: 0.25,
        }}
        onClick={handleToggle}
      >
        <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
          {expanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
        {name !== undefined && (
          <>
            <Typography
              component="span"
              sx={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "#9cdcfe",
                backgroundColor:
                  q &&
                  (name?.toLowerCase().includes(q) || selfOrDescendantMatch)
                    ? "rgba(255, 193, 7, 0.25)"
                    : "transparent",
              }}
            >
              {name}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "text.secondary",
                mx: 0.5,
              }}
            >
              :
            </Typography>
          </>
        )}
        <Typography
          component="span"
          sx={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "text.secondary",
          }}
        >
          {getTypeLabel(data)}
        </Typography>
        {!expanded && (
          <Typography
            component="span"
            sx={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "text.disabled",
              ml: 1,
            }}
          >
            {isArray ? "[...]" : "{...}"}
          </Typography>
        )}
        {canMutate && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}
          >
            <IconButton size="small" onClick={handleEditStart}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={handleAddChild}>
              <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
            {canDelete && (
              <IconButton size="small" onClick={handleDelete}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        )}
      </Box>
      {editingValue ? editPopper : null}
      {deletePopper}
      {addPopper}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ borderLeft: "1px solid", borderColor: "divider", ml: 1 }}>
          {entries.map(([key, value]) => (
            <JsonTreeNode
              key={key}
              data={value}
              name={key}
              depth={depth + 1}
              maxDepth={maxDepth}
              searchQuery={searchQuery}
              parentPath={currentPath}
              parentValue={data}
              storageTarget={storageTarget}
              onMutate={onMutate}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});

export default function JsonTreeView({
  data,
  name,
  defaultExpanded = true,
  maxDepth = 10,
  searchQuery = "",
  parentPath,
  parentValue,
  storageTarget,
  onMutate,
}: JsonTreeViewProps) {
  if (Array.isArray(data) && name === undefined) {
    return (
      <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>
        {data.map((item, index) => (
          <JsonTreeNode
            key={index}
            data={item}
            name={data.length > 1 ? `[${index}]` : undefined}
            defaultExpanded={defaultExpanded}
            depth={0}
            maxDepth={maxDepth}
            searchQuery={searchQuery}
            parentPath={parentPath}
            parentValue={data}
            storageTarget={storageTarget}
            onMutate={onMutate}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>
      <JsonTreeNode
        data={data}
        name={name}
        defaultExpanded={defaultExpanded}
        depth={0}
        maxDepth={maxDepth}
        searchQuery={searchQuery}
        parentPath={parentPath}
        parentValue={parentValue}
        storageTarget={storageTarget}
        onMutate={onMutate}
      />
    </Box>
  );
}
