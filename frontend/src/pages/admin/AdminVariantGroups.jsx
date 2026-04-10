/**
 * AdminVariantGroups — retired page
 *
 * Variant groups are now managed per-category on the Categories admin page.
 * This file is kept as a redirect so any bookmarked /admin/variant-groups URLs
 * don't produce a 404.
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Typography from "@mui/material/Typography"

export default function AdminVariantGroups() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate("/admin/categories", { replace: true })
  }, [navigate])

  return (
    <Typography sx={{ p: 2, color: "text.secondary" }}>
      Redirecting to Categories…
    </Typography>
  )
}
