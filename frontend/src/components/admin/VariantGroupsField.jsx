import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"

export default function VariantGroupsField({
  allGroups,
  attachedGroups,
  setAttachedGroups,
  dragSrcId,
  setDragSrcId,
}) {
  const pinned = attachedGroups.filter(
    (id) => allGroups.find((g) => g.groupId === id)?.isRequired
  )
  const optional = attachedGroups.filter(
    (id) => !allGroups.find((g) => g.groupId === id)?.isRequired
  )
  const available = allGroups.filter((g) => !attachedGroups.includes(g.groupId))

  function removeGroup(id) {
    setAttachedGroups((prev) => prev.filter((x) => x !== id))
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
    if (!e.target.value) return
    setAttachedGroups((prev) => [...prev, e.target.value])
    e.target.value = ""
  }

  const hasAny = attachedGroups.length > 0

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 6 }}>

      {/* ── Section label ─────────────────────────────────────────────────── */}
      <Typography sx={{
        fontSize: 13, fontWeight: 700,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}>
        Variant Groups
      </Typography>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!hasAny && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1 }}>
          No variant groups attached yet.
        </Typography>
      )}

      {/* ── Pinned (required) ─────────────────────────────────────────────── */}
      {pinned.map((id) => {
        const g = allGroups.find((x) => x.groupId === id)
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
        const g = allGroups.find((x) => x.groupId === id)

        // Stale reference
        if (!g) {
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
      <select
        value=""
        onChange={handleAttach}
        style={{
          fontFamily: "inherit",
          fontSize: 13,
          padding: "9px 10px",
          borderRadius: 8,
          border: "1px dashed #d1d5db",
          background: "#fff",
          color: available.length === 0 ? "#9ca3af" : "#374151",
          cursor: available.length === 0 ? "default" : "pointer",
          width: "100%",
          marginTop: 2,
        }}
        disabled={available.length === 0}
      >
        <option value="">
          {available.length === 0 ? "All groups attached" : "+ Attach a variant group…"}
        </option>
        {available.map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.adminName || g.name}
          </option>
        ))}
      </select>

    </Box>
  )
}
