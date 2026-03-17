import { jest } from '@jest/globals';
import { createOrder } from '../orders.controller.js';

// Mock the models and utils
jest.mock('../../models/Order.js');
jest.mock('../../models/MenuItem.js');
jest.mock('../../models/Cart.js');
jest.mock('../../utils/orderNumber.js');

import { Order } from '../../models/Order.js';
import { MenuItem } from '../../models/MenuItem.js';
import { Cart } from '../../models/Cart.js';
import { generateOrderNumber } from '../../utils/orderNumber.js';

describe('createOrder', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      get: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('Success cases', () => {
    test('creates order successfully and returns 201 with orderNumber', async () => {
      // Arrange
      const mockMenuItem = {
        _id: 'menuId1',
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: []
      };
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-20231201-12345',
        status: 'pending',
        total: 11
      };

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John Doe', phone: '1234567890' },
        items: [{ menuItemId: 'menuId1', qty: 1 }]
      };
      req.get.mockReturnValue('cartId123');

      MenuItem.findById.mockResolvedValue(mockMenuItem);
      generateOrderNumber.mockReturnValue('SC-20231201-12345');
      Order.findOne.mockResolvedValue(null); // No existing order
      Order.create.mockResolvedValue(mockOrder);
      Cart.findOneAndDelete.mockResolvedValue({});

      // Act
      await createOrder(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        orderId: 'orderId1',
        orderNumber: 'SC-20231201-12345',
        status: 'pending',
        total: 11
      });
      expect(Order.create).toHaveBeenCalledTimes(1);
      expect(Order.create).toHaveBeenCalledWith({
        orderNumber: 'SC-20231201-12345',
        orderType: 'pickup',
        customer: { name: 'John Doe', phone: '1234567890', address: '' },
        notesToBarista: '',
        items: [{
          menuItemId: 'menuId1',
          name: 'Test Item',
          qty: 1,
          unitPrice: 10,
          selectedOptions: [],
          instructions: '',
          lineTotal: 10
        }],
        subtotal: 10,
        total: 11
      });
      expect(Cart.findOneAndDelete).toHaveBeenCalledWith({ cartId: 'cartId123' });
    });

    test('persists structured selectedOptions without flattening them', async () => {
      const mockMenuItem = {
        _id: 'menuId1',
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: [{ label: 'Mayo', priceDelta: 0 }]
      };
      const mockOrder = {
        _id: 'orderId2',
        orderNumber: 'SC-20231201-12346',
        status: 'pending',
        total: 11
      };

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John Doe', phone: '1234567890' },
        items: [{
          menuItemId: 'menuId1',
          qty: 1,
          selectedOptions: [{ optionName: 'Mayo', suboptionName: 'Regular' }]
        }]
      };

      MenuItem.findById.mockResolvedValue(mockMenuItem);
      generateOrderNumber.mockReturnValue('SC-20231201-12346');
      Order.findOne.mockResolvedValue(null);
      Order.create.mockResolvedValue(mockOrder);

      await createOrder(req, res);

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              selectedOptions: [{ optionName: 'Mayo', suboptionName: 'Regular' }]
            })
          ]
        })
      );
    });

    test('ensures orderNumber exists and matches expected format', async () => {
      // Similar to above, but check the format
      const mockMenuItem = {
        _id: 'menuId1',
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: []
      };
      const mockOrder = {
        _id: 'orderId1',
        orderNumber: 'SC-20231201-12345',
        status: 'pending',
        total: 10
      };

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John Doe', phone: '1234567890' },
        items: [{ menuItemId: 'menuId1', qty: 1 }]
      };

      MenuItem.findById.mockResolvedValue(mockMenuItem);
      generateOrderNumber.mockReturnValue('SC-20231201-12345');
      Order.findOne.mockResolvedValue(null);
      Order.create.mockResolvedValue(mockOrder);

      await createOrder(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          orderNumber: expect.stringMatching(/^SC-\d{8}-\d{5}$/)
        })
      );
    });
  });

  describe('Validation errors', () => {
    test('missing orderType returns 400', async () => {
      req.body = { customer: { name: 'John', phone: '123' }, items: [{}] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid orderType' });
    });

    test('invalid orderType returns 400', async () => {
      req.body = { orderType: 'invalid', customer: { name: 'John', phone: '123' }, items: [{}] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid orderType' });
    });

    test('missing customer name returns 400', async () => {
      req.body = { orderType: 'pickup', customer: { phone: '123' }, items: [{}] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and phone are required' });
    });

    test('missing customer phone returns 400', async () => {
      req.body = { orderType: 'pickup', customer: { name: 'John' }, items: [{}] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and phone are required' });
    });

    test('delivery without address returns 400', async () => {
      req.body = { orderType: 'delivery', customer: { name: 'John', phone: '123' }, items: [{}] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Address is required for delivery' });
    });

    test('empty items returns 400', async () => {
      req.body = { orderType: 'pickup', customer: { name: 'John', phone: '123' }, items: [] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Order items are required' });
    });

    test('invalid item qty returns 400', async () => {
      req.body = { orderType: 'pickup', customer: { name: 'John', phone: '123' }, items: [{ menuItemId: 'id', qty: 0 }] };

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Each item must include menuItemId and qty >= 1' });
    });

    test('menu item not found returns 400', async () => {
      req.body = { orderType: 'pickup', customer: { name: 'John', phone: '123' }, items: [{ menuItemId: 'invalid', qty: 1 }] };

      MenuItem.findById.mockResolvedValue(null);

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' });
    });

    test('menu item not available returns 400', async () => {
      const mockMenuItem = { _id: 'id', isAvailable: false };
      req.body = { orderType: 'pickup', customer: { name: 'John', phone: '123' }, items: [{ menuItemId: 'id', qty: 1 }] };

      MenuItem.findById.mockResolvedValue(mockMenuItem);

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not available' });
    });
  });

  describe('DB errors', () => {
    test('Order.create failure throws error', async () => {
      const mockMenuItem = {
        _id: 'menuId1',
        name: 'Test Item',
        basePrice: 10,
        isAvailable: true,
        options: []
      };

      req.body = {
        orderType: 'pickup',
        customer: { name: 'John Doe', phone: '1234567890' },
        items: [{ menuItemId: 'menuId1', qty: 1 }]
      };

      MenuItem.findById.mockResolvedValue(mockMenuItem);
      generateOrderNumber.mockReturnValue('SC-20231201-12345');
      Order.findOne.mockResolvedValue(null);
      Order.create.mockRejectedValue(new Error('DB error'));

      await expect(createOrder(req, res)).rejects.toThrow('DB error');
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
