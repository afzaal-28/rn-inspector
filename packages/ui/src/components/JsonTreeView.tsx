import { useState, useCallback, memo, useEffect, type MouseEvent } from "react";
import {
  Box,
  IconButton,
  Typography,
  Collapse,
  TextField,
  Button,
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
  parentPath?: string;
  parentValue?: unknown;
  storageTarget?: "asyncStorage" | "redux";
  onMutate?: (payload: {
    target: "asyncStorage" | "redux";
    op: "set" | "delete";
    path: string;
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

const buildPath = (parentPath: string | undefined, name?: string): string => {
  if (!name) return parentPath || "";
  if (!parentPath) return name;
  const indexMatch = name.match(/^\[(\d+)\]$/);
  const normalizedName = indexMatch ? indexMatch[1] : name;
  const isIndex = /^\d+$/.test(normalizedName);
  return isIndex
    ? `${parentPath}[${normalizedName}]`
    : `${parentPath}.${normalizedName}`;
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
  const [addingChild, setAddingChild] = useState(false);
  const [childKeyDraft, setChildKeyDraft] = useState("");
  const [childValueDraft, setChildValueDraft] = useState("");
  const [addingSibling, setAddingSibling] = useState(false);
  const [siblingValueDraft, setSiblingValueDraft] = useState("");

  const currentPath = buildPath(parentPath, name);
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
  };

  const handleDelete = (event: MouseEvent) => {
    event.stopPropagation();
    if (!onMutate || !storageTarget || !currentPath || !canDelete) return;
    onMutate({ target: storageTarget, op: "delete", path: currentPath });
  };

  const handleAddChild = (event: MouseEvent) => {
    event.stopPropagation();
    setAddingChild(true);
    setChildKeyDraft("");
    setChildValueDraft("");
    setExpanded(true);
  };

  const handleEditSave = () => {
    if (!onMutate || !storageTarget || !currentPath) return;
    onMutate({
      target: storageTarget,
      op: "set",
      path: currentPath,
      value: parseInputValue(valueDraft),
    });
    setEditingValue(false);
  };

  const handleAddSave = () => {
    if (!onMutate || !storageTarget || !currentPath) return;
    const isArray = Array.isArray(data);
    let childPath = "";
    if (isArray) {
      const nextIndex = Array.isArray(data) ? data.length : 0;
      childPath = currentPath
        ? `${currentPath}[${nextIndex}]`
        : `[${nextIndex}]`;
    } else {
      if (!childKeyDraft.trim()) return;
      childPath = currentPath
        ? `${currentPath}.${childKeyDraft.trim()}`
        : childKeyDraft.trim();
    }
    onMutate({
      target: storageTarget,
      op: "set",
      path: childPath,
      value: parseInputValue(childValueDraft),
    });
    setAddingChild(false);
  };

  const handleAddSibling = (event: MouseEvent) => {
    event.stopPropagation();
    setAddingSibling(true);
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
    const parentArrayPath = parentPath || "";
    onMutate({
      target: storageTarget,
      op: "set",
      path: parentArrayPath,
      value: parentArray,
    });
    setAddingSibling(false);
  };

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
          {editingValue ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <TextField
                size="small"
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                multiline
                minRows={2}
                sx={{ minWidth: 220 }}
              />
              <Button size="small" variant="contained" onClick={handleEditSave}>
                Save
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => setEditingValue(false)}
              >
                Cancel
              </Button>
            </Box>
          ) : (
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
              }}
            >
              {formatValue(data)}
            </Typography>
          )}
          {canMutate && !editingValue && (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1 }}
            >
              <IconButton size="small" onClick={handleEditStart}>
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
              {isArrayItem && (
                <IconButton size="small" onClick={handleAddSibling}>
                  <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              {canDelete && (
                <IconButton size="small" onClick={handleDelete}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          )}
        </Box>
        {addingSibling && isArrayItem && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              pl: depth > 0 ? 4 : 2,
              py: 1,
              flexWrap: "wrap",
            }}
          >
            <TextField
              size="small"
              label="Sibling value"
              value={siblingValueDraft}
              onChange={(e) => setSiblingValueDraft(e.target.value)}
              multiline
              minRows={2}
              sx={{ minWidth: 240 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSiblingSave}
            >
              Insert
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setAddingSibling(false)}
            >
              Cancel
            </Button>
          </Box>
        )}
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
      {editingValue && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: 4,
            py: 1,
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            multiline
            minRows={2}
            sx={{ minWidth: 240 }}
          />
          <Button size="small" variant="contained" onClick={handleEditSave}>
            Save
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => setEditingValue(false)}
          >
            Cancel
          </Button>
        </Box>
      )}
      {addingChild && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: 4,
            py: 1,
            flexWrap: "wrap",
          }}
        >
          {!isArray && (
            <TextField
              size="small"
              label="Key"
              value={childKeyDraft}
              onChange={(e) => setChildKeyDraft(e.target.value)}
              sx={{ minWidth: 160 }}
            />
          )}
          <TextField
            size="small"
            label="Value"
            value={childValueDraft}
            onChange={(e) => setChildValueDraft(e.target.value)}
            multiline
            minRows={2}
            sx={{ minWidth: 240 }}
          />
          <Button size="small" variant="contained" onClick={handleAddSave}>
            Add
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => setAddingChild(false)}
          >
            Cancel
          </Button>
        </Box>
      )}
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
