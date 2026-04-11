import { jest } from '@jest/globals'
import { createOrder } from './orders.controller.js'

// Mock all dependencies
jest.mock('../models/Order.js')
jest.mock('../models/MenuItem.js')
jest.mock('../models/Cart.js')
jest.mock('../models/VariantGroup.js')
jest.mock('../utils/orderNumber.js')
jest.mock('../utils/variantPricing.js')

import { Order } from '../models/Order.js'
import { MenuItem } from '../models/MenuItem.js'
import { Cart } from '../models/Cart.js'
import { VariantGroup } from '../models/VariantGroup.js'
import { generateOrderNumber } from '../utils/orderNumber.js'
import {
  calculateSelectedOptionsDelta,
  createVariantGroupMap,
  resolveVariantGroupsForMenuItem,
  sanitizeSelectedOptions,
} from '../utils/variantPricing.js'

describe('createOrder Controller', () => {
  let req, res

  beforeEach(() => {
    req = {
      body: {},
      get: jest.fn(),
      user: undefined
    }
    res = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  set: jest.fn()
}
    jest.clearAllMocks()
  })

  describe('Input Validation', () => {
    it('returns 400 for missing orderType', async () => {
      req.body = {
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid orderType' })
    })

    it('returns 400 for invalid orderType', async () => {
      req.body = {
        orderType: 'invalid_type',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid orderType' })
    })

    it('accepts valid orderType: pickup', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('accepts valid orderType: dine_in', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'dine_in',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('returns 400 for missing customer name', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and phone are required' })
    })

    it('returns 400 for missing customer phone', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and phone are required' })
    })

    it('returns 400 for missing customer object', async () => {
      req.body = {
        orderType: 'pickup',
        items: [{ menuItemId: 1, qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and phone are required' })
    })

    it('returns 400 for non-array items', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: 'not-an-array'
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Order items are required' })
    })

    it('returns 400 for empty items array', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: []
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Order items are required' })
    })

    it('returns 400 for item missing menuItemId', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Each item must include menuItemId and qty >= 1' })
    })

    it('returns 400 for item missing qty', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Each item must include menuItemId and qty >= 1' })
    })

    it('returns 400 for item with qty < 1', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 0 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Each item must include menuItemId and qty >= 1' })
    })

    it('returns 400 for invalid menuItemId (non-numeric)', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 'invalid', qty: 1 }]
      }

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid menuItemId: invalid. Backend expects numeric id.' })
    })
  })

  describe('Menu Item Validation', () => {
    it('returns 400 when menu item not found', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 999, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(null)

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' })
    })

    it('returns 400 when menu item is not available', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Unavailable Item',
        basePrice: 10,
        isAvailable: false,
        options: [],
        variantGroups: []
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not available' })
    })
  })

  describe('Pricing Logic', () => {
    it('calculates price correctly for item without variants', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Simple Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              menuItemId: 1,
              name: 'Simple Item',
              qty: 1,
              unitPrice: 10,
              lineTotal: 10
            })
          ],
          subtotal: 10,
          total: 10.8 // 10 + (10 * 0.08) tax
        })
      )
    })

    it('calculates price with legacy options (no variantGroups)', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Item with Options',
        basePrice: 10,
        isAvailable: true,
        options: [
          { label: 'Extra Cheese', priceDelta: 2 },
          { label: 'Bacon', priceDelta: 3 }
        ],
        variantGroups: []
      }

      sanitizeSelectedOptions.mockReturnValue([
        { optionName: 'Extra Cheese' },
        { optionName: 'Bacon' }
      ])

      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 15.12 // (10 + 2 + 3) * 1 + tax
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{
          menuItemId: 1,
          qty: 1,
          selectedOptions: [
            { optionName: 'Extra Cheese' },
            { optionName: 'Bacon' }
          ]
        }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              unitPrice: 15, // 10 + 2 + 3
              lineTotal: 15
            })
          ],
          subtotal: 15,
          total: 15.12 // 15 + (15 * 0.08) tax
        })
      )
    })

    it('calculates price with variantGroups', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Item with Variants',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: ['size', 'toppings']
      }

      const mockVariantGroups = [
        { groupId: 'size', name: 'Size' },
        { groupId: 'toppings', name: 'Toppings' }
      ]

      sanitizeSelectedOptions.mockReturnValue([
        { optionName: 'Large', groupId: 'size' },
        { optionName: 'Cheese', groupId: 'toppings' }
      ])

      calculateSelectedOptionsDelta.mockReturnValue(5) // $5 total delta

      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 15.12 // (10 + 5) * 1 + tax
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{
          menuItemId: 1,
          qty: 1,
          selectedOptions: [
            { optionName: 'Large', groupId: 'size' },
            { optionName: 'Cheese', groupId: 'toppings' }
          ]
        }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      VariantGroup.find.mockResolvedValue(mockVariantGroups)
      createVariantGroupMap.mockReturnValue({})
      resolveVariantGroupsForMenuItem.mockReturnValue([])
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(VariantGroup.find).toHaveBeenCalledWith({
        groupId: { $in: ['size', 'toppings'] }
      })
      expect(calculateSelectedOptionsDelta).toHaveBeenCalled()
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              unitPrice: 15, // 10 + 5
              lineTotal: 15
            })
          ],
          subtotal: 15,
          total: 15.12
        })
      )
    })

    it('calculates price correctly with quantity > 1', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Bulk Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 27.36 // (10 * 3) + tax
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 3 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              qty: 3,
              unitPrice: 10,
              lineTotal: 30 // 10 * 3
            })
          ],
          subtotal: 30,
          total: 32.4 // 30 + (30 * 0.08) tax
        })
      )
    })

    it('calculates tax correctly (8% rate)', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Tax Test Item',
        basePrice: 100,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 108
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 100,
          total: 108 // 100 + (100 * 0.08)
        })
      )
    })
  })

  describe('Order Number Generation', () => {
    it('generates unique order number on first attempt', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-20231201-12345',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-20231201-12345')
      Order.findOne.mockResolvedValue(null) // No conflict
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(generateOrderNumber).toHaveBeenCalledTimes(1)
      expect(Order.findOne).toHaveBeenCalledWith({ orderNumber: 'SC-20231201-12345' })
    })

    it('regenerates order number if first attempt conflicts', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-20231201-67890',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber
        .mockReturnValueOnce('SC-20231201-12345') // First call - conflict
        .mockReturnValueOnce('SC-20231201-67890') // Second call - success
      Order.findOne
        .mockResolvedValueOnce({ orderNumber: 'SC-20231201-12345' }) // Conflict
        .mockResolvedValueOnce(null) // No conflict
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(generateOrderNumber).toHaveBeenCalledTimes(2)
      expect(Order.findOne).toHaveBeenCalledTimes(2)
    })

    it('gives up after 3 attempts and uses last generated number', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-20231201-99999',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber
        .mockReturnValueOnce('SC-20231201-12345')
        .mockReturnValueOnce('SC-20231201-67890')
        .mockReturnValueOnce('SC-20231201-99999')
      Order.findOne.mockResolvedValue({ orderNumber: 'existing' }) // Always conflict
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(generateOrderNumber).toHaveBeenCalledTimes(3)
      expect(Order.findOne).toHaveBeenCalledTimes(3)
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderNumber: 'SC-20231201-99999'
        })
      )
    })
  })

  describe('Cart Handling', () => {
    it('deletes cart when cartId provided in header', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }
      req.get.mockReturnValue('cart-123')

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)
      Cart.findOneAndDelete.mockResolvedValue({ cartId: 'cart-123' })

      await createOrder(req, res)

      expect(Cart.findOneAndDelete).toHaveBeenCalledWith({ cartId: 'cart-123' })
    })

    it('deletes cart when cartId provided in body', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }],
        cartId: 'body-cart-456'
      }
      req.get.mockReturnValue(null) // No header

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)
      Cart.findOneAndDelete.mockResolvedValue({ cartId: 'body-cart-456' })

      await createOrder(req, res)

      expect(Cart.findOneAndDelete).toHaveBeenCalledWith({ cartId: 'body-cart-456' })
    })

    it('prioritizes header cartId over body cartId', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }],
        cartId: 'body-cart-456'
      }
      req.get.mockReturnValue('header-cart-123') // Header takes priority

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)
      Cart.findOneAndDelete.mockResolvedValue({ cartId: 'header-cart-123' })

      await createOrder(req, res)

      expect(Cart.findOneAndDelete).toHaveBeenCalledWith({ cartId: 'header-cart-123' })
    })

    it('does not delete cart when no cartId provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }
      req.get.mockReturnValue(null)

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Cart.findOneAndDelete).not.toHaveBeenCalled()
    })
  })

  describe('User Authentication', () => {
    it('includes userId when user is authenticated', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }
      req.user = { id: 'user-123' }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123'
        })
      )
    })

    it('sets userId to null when user is not authenticated', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }
      req.user = undefined

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null
        })
      )
    })
  })

  describe('Customer Data Handling', () => {
    it('includes customer address when provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: {
          name: 'John Doe',
          phone: '1234567890',
          address: '123 Main St'
        },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: {
            name: 'John Doe',
            phone: '1234567890',
            address: '123 Main St'
          }
        })
      )
    })

    it('defaults customer address to empty string when not provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: {
          name: 'John Doe',
          phone: '1234567890'
          // No address provided
        },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: {
            name: 'John Doe',
            phone: '1234567890',
            address: ''
          }
        })
      )
    })
  })

  describe('Special Instructions', () => {
    it('includes notesToBarista when provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }],
        notesToBarista: 'Extra hot, no foam'
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notesToBarista: 'Extra hot, no foam'
        })
      )
    })

    it('defaults notesToBarista to empty string when not provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
        // No notesToBarista
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notesToBarista: ''
        })
      )
    })
  })

  describe('Item Instructions', () => {
    it('includes item-level instructions', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{
          menuItemId: 1,
          qty: 1,
          instructions: 'No onions please'
        }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              instructions: 'No onions please'
            })
          ]
        })
      )
    })

    it('defaults item instructions to empty string when not provided', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{
          menuItemId: 1,
          qty: 1
          // No instructions
        }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              instructions: ''
            })
          ]
        })
      )
    })
  })

  describe('Multiple Items', () => {
    it('handles multiple different items in one order', async () => {
      const mockMenuItem1 = {
        id: 1,
        name: 'Coffee',
        basePrice: 3,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockMenuItem2 = {
        id: 2,
        name: 'Croissant',
        basePrice: 4,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 7.56 // (3 + 4) + tax
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [
          { menuItemId: 1, qty: 1 },
          { menuItemId: 2, qty: 1 }
        ]
      }

      MenuItem.findOne
        .mockResolvedValueOnce(mockMenuItem1)
        .mockResolvedValueOnce(mockMenuItem2)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              menuItemId: 1,
              name: 'Coffee',
              unitPrice: 3,
              lineTotal: 3
            }),
            expect.objectContaining({
              menuItemId: 2,
              name: 'Croissant',
              unitPrice: 4,
              lineTotal: 4
            })
          ],
          subtotal: 7,
          total: 7.56 // 7 + (7 * 0.08)
        })
      )
    })

    it('handles multiple quantities of same item', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Coffee',
        basePrice: 3,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-001',
        status: 'received',
        total: 9.36 // (3 * 3) + tax
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [
          { menuItemId: 1, qty: 3 }
        ]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              menuItemId: 1,
              name: 'Coffee',
              qty: 3,
              unitPrice: 3,
              lineTotal: 9 // 3 * 3
            })
          ],
          subtotal: 9,
          total: 9.72 // 9 + (9 * 0.08)
        })
      )
    })
  })

  describe('Response Format', () => {
    it('returns correct response format on success', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }
      const mockOrder = {
        _id: 'orderId123',
        orderNumber: 'SC-20231201-12345',
        status: 'received',
        total: 10.8
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-20231201-12345')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockResolvedValue(mockOrder)

      await createOrder(req, res)

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({
        orderId: 'orderId123',
        orderNumber: 'SC-20231201-12345',
        status: 'received',
        total: 10.8
      })
    })
  })

  describe('Error Handling', () => {
    it('handles database errors during menu item lookup', async () => {
      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockRejectedValue(new Error('Database connection failed'))

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' })
    })

    it('handles database errors during order creation', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: []
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      generateOrderNumber.mockReturnValue('SC-001')
      Order.findOne.mockResolvedValue(null)
      Order.create.mockRejectedValue(new Error('Order creation failed'))

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' })
    })

    it('handles variant group lookup errors', async () => {
      const mockMenuItem = {
        id: 1,
        name: 'Item with Variants',
        basePrice: 10,
        isAvailable: true,
        options: [],
        variantGroups: ['size']
      }

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John', phone: '1234567890' },
        items: [{ menuItemId: 1, qty: 1 }]
      }

      MenuItem.findOne.mockResolvedValue(mockMenuItem)
      VariantGroup.find.mockRejectedValue(new Error('Variant lookup failed'))

      await createOrder(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' })
    })
  })
})
