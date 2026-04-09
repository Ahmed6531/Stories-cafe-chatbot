import { describe, it, expect, vi } from "vitest"
import { submitMenuItem } from "./submitMenuItem"

describe("submitMenuItem (logic behind onCreateSubmit)", () => {
  it("CREATE flow: calls create, uploads image, refreshes items, resets state", async () => {
    const createMenuItem = vi.fn().mockResolvedValue({ id: 123 })
    const updateMenuItem = vi.fn()
    const uploadMenuItemImage = vi.fn().mockResolvedValue({ imageUrl: "x" })
    const fetchMenu = vi.fn().mockResolvedValue({ items: [{ id: 1 }] })

    const setItems = vi.fn()
    const resetForm = vi.fn()
    const resetImage = vi.fn()
    const setEditingId = vi.fn()
    const setFormError = vi.fn()
    const setSaving = vi.fn()

    await submitMenuItem({
      editingId: null,
      form: {
        name: "Burger",
        category: "Main",
        price: "10",
        description: "",
        isAvailable: true,
      },
      imageFile: { name: "img.png" }, // fake file object is fine for unit tests
      createMenuItem,
      updateMenuItem,
      uploadMenuItemImage,
      fetchMenu,
      setItems,
      resetForm,
      resetImage,
      setEditingId,
      setFormError,
      setSaving,
    })

    expect(createMenuItem).toHaveBeenCalledTimes(1)
    expect(createMenuItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Burger", category: "Main", price: 10 })
    )

    expect(updateMenuItem).not.toHaveBeenCalled()

    expect(uploadMenuItemImage).toHaveBeenCalledTimes(1)
    expect(uploadMenuItemImage).toHaveBeenCalledWith(123, expect.any(Object))

    expect(fetchMenu).toHaveBeenCalledTimes(1)
    expect(setItems).toHaveBeenCalledWith([{ id: 1 }])

    expect(resetForm).toHaveBeenCalledTimes(1)
    expect(resetImage).toHaveBeenCalledTimes(1)
    expect(setEditingId).toHaveBeenCalledWith(null)
    expect(setFormError).toHaveBeenCalledWith("")
  })

  it("EDIT flow: calls update (not create) and does not upload if no image", async () => {
    const createMenuItem = vi.fn()
    const updateMenuItem = vi.fn().mockResolvedValue({})
    const uploadMenuItemImage = vi.fn()
    const fetchMenu = vi.fn().mockResolvedValue({ items: [] })

    const setItems = vi.fn()
    const resetForm = vi.fn()
    const resetImage = vi.fn()
    const setEditingId = vi.fn()
    const setFormError = vi.fn()
    const setSaving = vi.fn()

    await submitMenuItem({
      editingId: 7,
      form: {
        name: "Latte",
        category: "Coffee",
        price: "5",
        description: "",
        isAvailable: true,
      },
      imageFile: null,
      createMenuItem,
      updateMenuItem,
      uploadMenuItemImage,
      fetchMenu,
      setItems,
      resetForm,
      resetImage,
      setEditingId,
      setFormError,
      setSaving,
    })

    expect(updateMenuItem).toHaveBeenCalledTimes(1)
    expect(updateMenuItem).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: "Latte", price: 5 })
    )

    expect(createMenuItem).not.toHaveBeenCalled()
    expect(uploadMenuItemImage).not.toHaveBeenCalled()
  })
})
it("ERROR flow: calls setFormError when an API call fails", async () => {
  // 1. Arrange: Mock createMenuItem to reject (fail)
  const createMenuItem = vi.fn().mockRejectedValue(new Error("Server Error"));
  const setFormError = vi.fn();
  const setSaving = vi.fn();

  // 2. Act: Call the function
  await submitMenuItem({
    editingId: null,
    form: { price: "10" },
    createMenuItem,
    setFormError,
    setSaving,
    // Provide empty mocks for the rest so it doesn't crash
    fetchMenu: vi.fn(),
    setItems: vi.fn(),
    resetForm: vi.fn(),
    resetImage: vi.fn(),
    setEditingId: vi.fn(),
  });

  // 3. Assert: Verify the error was handled
  expect(setFormError).toHaveBeenCalledWith("Server Error");
  expect(setSaving).toHaveBeenLastCalledWith(false); // Ensure loader stops
});