import { jest } from '@jest/globals';
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getMenu,
  getMenuCategories,
  getMenuItem,
  getMenuByCategory,
  getFeaturedMenu
} from '../menu.controller.js';
import { MenuItem } from '../../models/MenuItem.js';

jest.mock('../../models/MenuItem.js');

describe('Menu Controller CRUD Operations', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      get: jest.fn()
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('createMenuItem', () => {
    it('creates a new menu item with all required fields', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Classic cappuccino',
        basePrice: 4.50,
        image: '/images/cappuccino.png',
        slug: 'cappuccino',
        isAvailable: true,
        isFeatured: false
      };

      // Mock the chain: MenuItem.findOne().sort()
      const mockSort = jest.fn().mockResolvedValue(null); // No existing items
      MenuItem.findOne.mockReturnValue({ sort: mockSort });

      const mockSavedItem = { id: 1, ...req.body };
      MenuItem.prototype.save = jest.fn().mockResolvedValue(mockSavedItem);

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Menu item created successfully'
        })
      );
    });

    it('returns 400 when missing required field: name', async () => {
      req.body = {
        category: 'Coffee',
        description: 'Test',
        basePrice: 4.50,
        image: '/image.png',
        slug: 'test'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('name')
        })
      );
    });

    it('returns 400 when missing required field: category', async () => {
      req.body = {
        name: 'Cappuccino',
        description: 'Test',
        basePrice: 4.50,
        image: '/image.png',
        slug: 'cappuccino'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('category')
        })
      );
    });

    it('returns 400 when missing required field: description', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        basePrice: 4.50,
        image: '/image.png',
        slug: 'cappuccino'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('description')
        })
      );
    });

    it('returns 400 when basePrice is missing', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        image: '/image.png',
        slug: 'cappuccino'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('basePrice')
        })
      );
    });

    it('returns 400 when missing required field: image', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        basePrice: 4.50,
        slug: 'cappuccino'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('image')
        })
      );
    });

    it('returns 400 when missing required field: slug', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        basePrice: 4.50,
        image: '/image.png'
      };

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('slug')
        })
      );
    });

    it('generates correct next numeric ID', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        basePrice: 4.50,
        image: '/image.png',
        slug: 'cappuccino'
      };

      const mockSort = jest.fn().mockResolvedValue({ id: 42 });
      MenuItem.findOne.mockReturnValue({ sort: mockSort });
      MenuItem.prototype.save = jest.fn().mockResolvedValue({ id: 43 });

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('trims and normalizes input fields', async () => {
      req.body = {
        name: '  Cappuccino  ',
        category: '  Coffee  ',
        description: '  Test description  ',
        basePrice: 4.50,
        image: '  /image.png  ',
        slug: '  CAPPUCCINO  ',
        isAvailable: true,
        isFeatured: false
      };

      const mockSort = jest.fn().mockResolvedValue(null);
      MenuItem.findOne.mockReturnValue({ sort: mockSort });
      MenuItem.prototype.save = jest.fn().mockResolvedValue({});

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('handles invalid price (non-numeric)', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        basePrice: 'invalid',
        image: '/image.png',
        slug: 'cappuccino'
      };

      const mockSort = jest.fn().mockResolvedValue(null);
      MenuItem.findOne.mockReturnValue({ sort: mockSort });
      MenuItem.prototype.save = jest.fn().mockRejectedValue(new Error('Price validation failed'));

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles database errors gracefully', async () => {
      req.body = {
        name: 'Cappuccino',
        category: 'Coffee',
        description: 'Test',
        basePrice: 4.50,
        image: '/image.png',
        slug: 'cappuccino'
      };

      // Properly placed inside test
      const mockSort = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      MenuItem.findOne.mockReturnValue({ sort: mockSort });

      await createMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Database')
        })
      );
    });
  });

  describe('updateMenuItem', () => {
    it('updates an existing menu item', async () => {
      req.params = { id: '1' };
      req.body = {
        name: 'Updated Cappuccino',
        basePrice: 5.00,
        isAvailable: true
      };

      const mockUpdatedItem = {
        id: 1,
        name: 'Updated Cappuccino',
        basePrice: 5.00,
        isAvailable: true
      };

      MenuItem.findOneAndUpdate.mockResolvedValue(mockUpdatedItem);
      MenuItem.findOne.mockResolvedValue(mockUpdatedItem);

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Menu item updated successfully'
        })
      );
    });

    it('returns 404 when updating non-existent item', async () => {
      req.params = { id: '999' };
      req.body = { name: 'Updated Name' };

      MenuItem.findOneAndUpdate.mockResolvedValue(null);

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Menu item not found'
        })
      );
    });

    it('prevents updating the numeric ID field', async () => {
      req.params = { id: '1' };
      req.body = {
        id: 999,
        name: 'Updated Name'
      };

      MenuItem.findOneAndUpdate.mockResolvedValue({ id: 1, name: 'Updated Name' });
      MenuItem.findOne.mockResolvedValue({ id: 1, name: 'Updated Name' });

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('converts basePrice to float', async () => {
      req.params = { id: '1' };
      req.body = { basePrice: '5.99' };

      MenuItem.findOneAndUpdate.mockResolvedValue({ id: 1, basePrice: 5.99 });
      MenuItem.findOne.mockResolvedValue({ id: 1, basePrice: 5.99 });

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 400 when no valid fields are provided', async () => {
      req.params = { id: '1' };
      req.body = { id: 1 };

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No valid fields')
        })
      );
    });

    it('handles database errors during update', async () => {
      req.params = { id: '1' };
      req.body = { name: 'Updated Name' };

      MenuItem.findOneAndUpdate.mockRejectedValue(new Error('Update failed'));

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('normalizes slug field to lowercase', async () => {
      req.params = { id: '1' };
      req.body = { slug: 'CAPPUCCINO' };

      MenuItem.findOneAndUpdate.mockResolvedValue({ id: 1, slug: 'cappuccino' });
      MenuItem.findOne.mockResolvedValue({ id: 1, slug: 'cappuccino' });

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('converts boolean fields correctly', async () => {
      req.params = { id: '1' };
      req.body = { isAvailable: 'true', isFeatured: 0 };

      MenuItem.findOneAndUpdate.mockResolvedValue({
        id: 1,
        isAvailable: true,
        isFeatured: false
      });
      MenuItem.findOne.mockResolvedValue({
        id: 1,
        isAvailable: true,
        isFeatured: false
      });

      await updateMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteMenuItem', () => {
    it('deletes an existing menu item', async () => {
      req.params = { id: '1' };

      MenuItem.findOneAndDelete.mockResolvedValue({
        id: 1,
        name: 'Cappuccino'
      });

      await deleteMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Menu item deleted successfully'
        })
      );
    });

    it('returns 404 when deleting non-existent item', async () => {
      req.params = { id: '999' };

      MenuItem.findOneAndDelete.mockResolvedValue(null);

      await deleteMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Menu item not found'
        })
      );
    });

    it('handles database errors during deletion', async () => {
      req.params = { id: '1' };

      MenuItem.findOneAndDelete.mockRejectedValue(new Error('Delete failed'));

      await deleteMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to delete menu item'
        })
      );
    });

    it('deletes item by numeric ID', async () => {
      req.params = { id: '42' };

      MenuItem.findOneAndDelete.mockResolvedValue({
        id: 42,
        name: 'Test Item'
      });

      await deleteMenuItem(req, res);

      expect(MenuItem.findOneAndDelete).toHaveBeenCalledWith(
        { id: 42 },
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('GET Operations', () => {
    it('retrieves all menu items', async () => {
      const mockItems = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ];

      MenuItem.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockItems)
      });

      await getMenu(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 2
        })
      );
    });

    it('retrieves menu categories', async () => {
      const mockCategories = ['Coffee', 'Pastries', 'Beverages'];

      MenuItem.distinct.mockResolvedValue(mockCategories);

      await getMenuCategories(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          categories: expect.arrayContaining(['Coffee', 'Pastries'])
        })
      );
    });

    it('retrieves single menu item by ID', async () => {
      req.params = { id: '1' };

      const mockItem = {
        id: 1,
        name: 'Cappuccino',
        variantGroups: [],
        toObject: () => ({
          id: 1,
          name: 'Cappuccino',
          variants: []
        })
      };

      MenuItem.findOne.mockResolvedValue(mockItem);

      await getMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          item: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('returns 404 for non-existent menu item', async () => {
      req.params = { id: '999' };

      MenuItem.findOne.mockResolvedValue(null);

      await getMenuItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Menu item not found'
        })
      );
    });

    it('retrieves featured menu items', async () => {
      const mockFeaturedItems = [
        { id: 1, name: 'Featured Item 1', isFeatured: true }
      ];

      MenuItem.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockFeaturedItems)
      });

      await getFeaturedMenu(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1
        })
      );
    });

    it('retrieves items by category', async () => {
      req.params = { category: 'Coffee' };

      const mockCoffeeItems = [
        { id: 1, name: 'Espresso', category: 'Coffee' },
        { id: 2, name: 'Cappuccino', category: 'Coffee' }
      ];

      MenuItem.find.mockResolvedValue(mockCoffeeItems);

      await getMenuByCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 2,
          category: 'Coffee'
        })
      );
    });
  });
});