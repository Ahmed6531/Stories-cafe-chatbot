import { useEffect, useState } from "react"
import Box from "@mui/material/Box"
import FormControl from "@mui/material/FormControl"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Skeleton from "@mui/material/Skeleton"
import Typography from "@mui/material/Typography"
import { fetchVariantGroupsByCategory } from "../../API/variantGroupApi"

function getVariantGroupId(groupRef) {
  if (typeof groupRef === "string") {
    return groupRef.trim()
  }

  if (!groupRef || typeof groupRef !== "object") {
    return ""
  }

  for (const candidate of [groupRef.refId, groupRef.groupId, groupRef.id]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
}

function sanitizeVariantGroupIds(variantGroups) {
  if (!Array.isArray(variantGroups)) {
    return []
  }

  const seen = new Set()
  return variantGroups.reduce((groupIds, groupRef) => {
    const groupId = getVariantGroupId(groupRef)
    if (!groupId || seen.has(groupId)) {
      return groupIds
    }

    seen.add(groupId)
    groupIds.push(groupId)
    return groupIds
  }, [])
}

export default function VariantGroupsField({
  categoryId,          // ObjectId string of the selected category
  attachedGroups,
  setAttachedGroups,
  dragSrcId,
  setDragSrcId,
}) {
  const attachSelectSx = {
    mt: 0.25,
    "& .MuiOutlinedInput-notchedOutline": {
      border: "0.5px solid rgba(0,0,0,0.15)",
    },
    "& .MuiSelect-select": {
      padding: "8px 34px 8px 10px",
      fontSize: 12,
      color: "#111111",
      backgroundColor: "#f8f9f8",
      borderRadius: "8px",
    },
    "& .MuiSvgIcon-root": {
      color: "#9e9e9e",
      right: 10,
    },
    "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#00704a",
      boxShadow: "0 0 0 2px rgba(0,112,74,0.10)",
    },
  }

  const attachMenuProps = {
    PaperProps: {
      sx: {
        mt: 0.5,
        borderRadius: "10px",
        border: "0.5px solid rgba(0,0,0,0.10)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
        "& .MuiMenuItem-root": {
          fontSize: 12,
          minHeight: 34,
        },
      },
    },
  }

  const [allGroups, setAllGroups] = useState([])
  const [loading, setLoading] = useState(Boolean(categoryId))

  // Re-fetch variant groups whenever the category changes. The parent keys this
  // component by categoryId, so the local list resets on category switches; the
  // cleanup guard keeps an outdated request from overwriting a newer one.
  useEffect(() => {
    console.debug("[AdminItems] category changed", {
      categoryId,
    })
    if (!categoryId) return
    let cancelled = false
    setLoading(true)
    setAllGroups([])
    fetchVariantGroupsByCategory(categoryId)
      .then((groups) => {
        if (cancelled) return
        setAllGroups(groups)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAllGroups([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [categoryId])

  useEffect(() => {
    const sanitized = sanitizeVariantGroupIds(attachedGroups)
    const isAlreadySanitized =
      Array.isArray(attachedGroups) &&
      sanitized.length === attachedGroups.length &&
      attachedGroups.every(
        (groupId, index) =>
          typeof groupId === "string" && groupId.trim() === sanitized[index],
      )
    if (isAlreadySanitized) return

    console.warn("[AdminItems] removing blank variant-group ids", {
      categoryId,
      attachedGroupIds: attachedGroups,
      sanitizedGroupIds: sanitized,
    })
    setAttachedGroups(sanitized)
  }, [attachedGroups, categoryId, setAttachedGroups])

  useEffect(() => {
    if (!categoryId || loading) return

    const allowedIds = new Set(allGroups.map((group) => getVariantGroupId(group)).filter(Boolean))
    const staleIds = sanitizeVariantGroupIds(attachedGroups).filter((groupId) => !allowedIds.has(groupId))

    console.debug("[AdminItems] variant group scope resolved", {
      categoryId,
      allowedGroupIds: allGroups.map((group) => getVariantGroupId(group)).filter(Boolean),
      attachedGroupIds: sanitizeVariantGroupIds(attachedGroups),
      staleGroupIds: staleIds,
    })

    if (staleIds.length === 0) return

    console.warn("[AdminItems] dropping stale variant-group selections", {
      categoryId,
      staleGroupIds: staleIds,
    })
    setAttachedGroups((prev) => sanitizeVariantGroupIds(prev).filter((groupId) => allowedIds.has(groupId)))
  }, [allGroups, attachedGroups, categoryId, loading, setAttachedGroups])

  const normalizedAttachedGroups = sanitizeVariantGroupIds(attachedGroups)
  const normalizedAllGroups = allGroups
    .map((group) => {
      const groupId = getVariantGroupId(group)
      return groupId ? { ...group, groupId } : null
    })
    .filter(Boolean)
  const pinned = normalizedAttachedGroups.filter(
    (id) => normalizedAllGroups.find((g) => g.groupId === id)?.isRequired
  )
  const optional = normalizedAttachedGroups.filter(
    (id) => !normalizedAllGroups.find((g) => g.groupId === id)?.isRequired
  )
  const available = normalizedAllGroups.filter((g) => !normalizedAttachedGroups.includes(g.groupId))

  function removeGroup(id) {
    console.debug("[AdminItems] remove variant group", { categoryId, groupId: id })
    setAttachedGroups((prev) => sanitizeVariantGroupIds(prev).filter((groupId) => groupId !== id))
  }

  function handleDragStart(e, id) {
    setDragSrcId(id)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  function handleDrop(e, targetId) {
    e.preventDefault()
    if (!dragSrcId || dragSrcId === targetId) return
    const srcIdx = optional.indexOf(dragSrcId)
    const tgtIdx = optional.indexOf(targetId)
    if (srcIdx === -1 || tgtIdx === -1) return
    const reordered = [...optional]
    reordered.splice(srcIdx, 1)
    reordered.splice(tgtIdx, 0, dragSrcId)
    setAttachedGroups([...pinned, ...reordered])
    setDragSrcId(null)
  }

  function handleDragEnd() {
    setDragSrcId(null)
  }

  function handleAttach(e) {
    const groupId = getVariantGroupId(e.target.value)
    if (!groupId) return
    console.debug("[AdminItems] attach variant group", {
      categoryId,
      groupId,
      allowedGroupIds: normalizedAllGroups.map((group) => group.groupId),
    })
    setAttachedGroups((prev) => sanitizeVariantGroupIds([...prev, groupId]))
  }

  const hasAny = normalizedAttachedGroups.length > 0

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

      {/* ── Section label ─────────────────────────────────────────────────── */}
      <Typography sx={{
        fontSize: 13, fontWeight: 700,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}>
        Variant Groups
      </Typography>

      {/* ── No category selected ─────────────────────────────────────────── */}
      {!categoryId && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1 }}>
          Select a category above to see available variant groups.
        </Typography>
      )}

      {/* ── Empty state (category selected, nothing attached) ────────────── */}
      {categoryId && !hasAny && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1 }}>
          {loading ? "Loading variant groups..." : "No variant groups attached yet."}
        </Typography>
      )}

      {/* ── Pinned (required) ─────────────────────────────────────────────── */}
      {pinned.map((id) => {
        const g = normalizedAllGroups.find((x) => x.groupId === id)
        if (!g) return null
        return (
          <Box key={id} sx={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: 8,
            border: "1px solid #e5e7eb", background: "#fafafa",
          }}>
            <Box sx={{ width: 16, display: "flex", alignItems: "center", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
              </svg>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {g.adminName || g.name}
              </Typography>
              {g.customerLabel && g.customerLabel !== (g.adminName || g.name) && (
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  shows as "{g.customerLabel}"
                </Typography>
              )}
            </Box>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px",
              borderRadius: 6, background: "#fef3c7", color: "#92400e", flexShrink: 0,
            }}>required</span>
            <button
              type="button"
              onClick={() => removeGroup(id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 16, color: "#9ca3af", lineHeight: 1,
                padding: "2px 4px", flexShrink: 0,
              }}
            >×</button>
          </Box>
        )
      })}

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      {pinned.length > 0 && optional.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", my: "2px" }}>
          <Box sx={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
          <Typography sx={{ fontSize: 11, color: "text.secondary", whiteSpace: "nowrap" }}>
            optional — drag to reorder
          </Typography>
          <Box sx={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
        </Box>
      )}

      {/* ── Optional (draggable) ──────────────────────────────────────────── */}
      {optional.map((id) => {
        const g = normalizedAllGroups.find((x) => x.groupId === id)

        // Stale reference
        if (!g) {
          if (loading) {
            return (
              <Box key={id} sx={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: 8,
                border: "1px solid #e5e7eb", background: "#fff",
              }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0, opacity: 0.18 }}>
                  {[0,1,2].map((i) => (
                    <Box key={i} sx={{ width: 14, height: "1.5px", background: "#374151", borderRadius: 2 }} />
                  ))}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Skeleton animation="wave" variant="text" width="42%" height={22} />
                  <Skeleton animation="wave" variant="text" width="28%" height={16} />
                </Box>
                <Skeleton animation="wave" variant="rounded" width={58} height={24} sx={{ borderRadius: "6px" }} />
              </Box>
            )
          }

          return (
            <Box key={id} sx={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 12px", borderRadius: 8,
              border: "1px solid #fecaca", background: "#fff5f5",
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>
                  Unknown group
                </Typography>
                <Typography sx={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                  {id}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: "#dc2626", flexShrink: 0 }}>
                deleted or renamed
              </Typography>
              <button
                type="button"
                onClick={() => removeGroup(id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "#9ca3af", lineHeight: 1,
                  padding: "2px 4px", flexShrink: 0,
                }}
              >×</button>
            </Box>
          )
        }

        return (
          <Box
            key={id}
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, id)}
            onDragEnd={handleDragEnd}
            sx={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 12px", borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: dragSrcId === id ? "rgba(0,112,74,0.04)" : "#fff",
              cursor: "grab",
              opacity: dragSrcId === id ? 0.45 : 1,
              transition: "background 0.15s, opacity 0.15s",
              userSelect: "none",
            }}
          >
            {/* drag handle */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0, opacity: 0.3 }}>
              {[0,1,2].map((i) => (
                <Box key={i} sx={{ width: 14, height: "1.5px", background: "#374151", borderRadius: 2 }} />
              ))}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {g.adminName || g.name}
              </Typography>
              {g.customerLabel && g.customerLabel !== (g.adminName || g.name) && (
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  shows as "{g.customerLabel}"
                </Typography>
              )}
            </Box>

            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px",
              borderRadius: 6, background: "#f3f4f6", color: "#6b7280", flexShrink: 0,
            }}>optional</span>

            <button
              type="button"
              onClick={() => removeGroup(id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 16, color: "#9ca3af", lineHeight: 1,
                padding: "2px 4px", flexShrink: 0,
              }}
            >×</button>
          </Box>
        )
      })}

      {/* ── Attach select — always shown ──────────────────────────────────── */}
      <FormControl size="small" fullWidth sx={attachSelectSx}>
        <Select
          value=""
          displayEmpty
          onChange={handleAttach}
          MenuProps={attachMenuProps}
          disabled={loading || available.length === 0}
        >
          <MenuItem value="">
            <em>
              {loading
                ? "Loading variant groups..."
                : available.length === 0
                ? "All groups attached"
                : "Attach a variant group"}
            </em>
          </MenuItem>
          {available.map((g) => (
            <MenuItem key={g.groupId} value={g.groupId}>
              {g.adminName || g.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

    </Box>
  )
}
