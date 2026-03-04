import { useEffect, useState } from "react"
import { fetchMenu, createMenuItem, updateMenuItem, deleteMenuItem } from "../../API/menuApi"

export default function AdminItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    category: "",
    basePrice: "",   // ✅ renamed
    description: "",
    isAvailable: true,
    slug: "",
    image: "",
  })

  const [formError, setFormError] = useState("")

  useEffect(() => {
    async function loadItems() {
      try {
        setLoading(true)
        const data = await fetchMenu()
        setItems(data.items)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadItems()
  }, [])

  function onFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  function validateForm() {
    if (!form.name.trim()) return "Name is required"
    if (!form.category.trim()) return "Category is required"
    if (!form.slug.trim()) return "Slug is required"
    if (!form.image.trim()) return "Image URL is required"

    const priceNum = Number(form.basePrice)
    if (Number.isNaN(priceNum) || priceNum < 0)
      return "Base price must be a number >= 0"

    return ""
  }

  async function onCreateSubmit(e) {
    e.preventDefault()

    const msg = validateForm()
    if (msg) {
      setFormError(msg)
      return
    }

    const payload = {
      ...form,
      basePrice: Number(form.basePrice),
    }

    setSaving(true)

    try {
      if (editingId) {
        await updateMenuItem(editingId, payload)
      } else {
        await createMenuItem(payload)
      }

      const data = await fetchMenu()
      setItems(data.items)

      setForm({
        name: "",
        category: "",
        basePrice: "",
        description: "",
        isAvailable: true,
        slug: "",
        image: "",
      })

      setEditingId(null)
      setFormError("")
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    const ok = confirm("Are you sure you want to delete this item?")
    if (!ok) return

    try {
      await deleteMenuItem(id)
      const data = await fetchMenu()
      setItems(data.items)
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (loading) return <p>Loading menu items...</p>
  if (error) return <p style={{ color: "red" }}>{error}</p>

  return (
    <div>
      <h1>Admin - Manage Menu Items</h1>

      <form onSubmit={onCreateSubmit} style={{ marginTop: 20, maxWidth: 600 }}>
        <h2 style={{ marginBottom: 10 }}>
          {editingId ? "Edit Item" : "Create New Item"}
        </h2>

        {formError ? <p style={{ color: "red" }}>{formError}</p> : null}

        <div style={{ display: "grid", gap: 10 }}>
          <input
            name="name"
            placeholder="Name"
            value={form.name}
            onChange={onFormChange}
          />

          <input
            name="category"
            placeholder="Category"
            value={form.category}
            onChange={onFormChange}
          />

          <input
            name="slug"
            placeholder="Slug (unique)"
            value={form.slug}
            onChange={onFormChange}
          />

          <input
            name="image"
            placeholder="Image URL"
            value={form.image}
            onChange={onFormChange}
          />

          <input
            name="basePrice"
            placeholder="Base Price"
            value={form.basePrice}
            onChange={onFormChange}
            type="number"
            step="0.01"
          />

          <textarea
            name="description"
            placeholder="Description"
            value={form.description}
            onChange={onFormChange}
            rows={3}
          />

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              name="isAvailable"
              checked={form.isAvailable}
              onChange={onFormChange}
            />
            Available
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Create"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm({
                    name: "",
                    category: "",
                    basePrice: "",
                    description: "",
                    isAvailable: true,
                    slug: "",
                    image: "",
                  })
                  setFormError("")
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <table border="1" cellPadding="8" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Slug</th>
            <th>Image</th>
            <th>Base Price</th>
            <th>Available</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{item.slug}</td>
              <td>
                {item.image ? (
                  <img src={item.image} alt={item.name} width={50} />
                ) : (
                  "-"
                )}
              </td>
              <td>L.L {item.basePrice}</td>
              <td>{item.isAvailable ? "Yes" : "No"}</td>
              <td>
                <button
                  onClick={() => {
                    setEditingId(item.id)
                    setForm({
                      name: item.name || "",
                      category: item.category || "",
                      basePrice: item.basePrice ?? "",
                      description: item.description || "",
                      isAvailable: item.isAvailable ?? true,
                      slug: item.slug || "",
                      image: item.image || "",
                    })
                    setFormError("")
                  }}
                >
                  Edit
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  style={{ marginLeft: "8px" }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}