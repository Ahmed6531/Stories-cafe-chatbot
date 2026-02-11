export const variantCatalog = {
  "yogurt-size": {
      "name": "Size",
      "description": "Satisfaction in every cup!",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Small",
          "description": "no toppings",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Medium",
          "description": "no toppings",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Large",
          "description": "no toppings",
          "additionalPrice": 100000,
          "isActive": true,
          "order": 3
        }
      ]
    },
    "yogurt-flavors-standard": {
      "name": "Flavors",
      "description": "Feel free to choose your favorite flavor!",
      "isRequired": true,
      "maxSelections": 2,
      "order": 2,
      "options": [
        {
          "name": "Original",
          "description": "Original flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Chocolate",
          "description": "Rich chocolate flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Mango",
          "description": "Tropical mango flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3
        },
        {
          "name": "Pomegranate",
          "description": "Tangy pomegranate flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 4
        },
        {
          "name": "Blueberry",
          "description": "Sweet blueberry flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 5
        }
      ]
    },
    "yogurt-flavors-pistachio": {
      "name": "Flavors",
      "description": "Choose your favorite flavor!",
      "isRequired": true,
      "maxSelections": 2,
      "order": 2,
      "options": [
        {
          "name": "Pistachio",
          "description": "Nutty pistachio flavor",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Pistachio-Chocolate",
          "description": "Pistachio with chocolate swirl",
          "additionalPrice": 25000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Pistachio-Vanilla",
          "description": "Pistachio with vanilla",
          "additionalPrice": 15000,
          "isActive": true,
          "order": 3
        }
      ]
    },
    "yogurt-toppings": {
      "name": "Toppings",
      "description": "Choose your toppings!",
      "isRequired": false,
      "maxSelections": null,
      "order": 3,
      "options": [
        {
          "name": "Mango",
          "description": "Mango topping",
          "additionalPrice": 120000,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Pineapple",
          "description": "Pineapple topping",
          "additionalPrice": 120000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Strawberry",
          "description": "Strawberry topping",
          "additionalPrice": 120000,
          "isActive": true,
          "order": 3
        }
      ]
    },
    "coffee-size-standard": {
      "name": "Choose Size",
      "description": "",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Small",
          "description": "small",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Medium",
          "description": "med",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        }
      ]
    },
    "coffee-size-with-large": {
      "name": "Choose Size",
      "description": "",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Small",
          "description": "small",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Medium",
          "description": "med",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Large",
          "description": "Large",
          "additionalPrice": 100000,
          "isActive": false,
          "order": 3
        }
      ]
    },
    "coffee-espresso-options": {
      "name": "Espresso Options",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 2,
      "options": [
        {
          "name": "Shot Decaffe",
          "description": "decaf",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Add Shot",
          "description": "decaf",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Yirgacheffe Shot",
          "description": "decaf",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 3
        }
      ]
    },
    "coffee-milk-options": {
      "name": "Milk",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 3,
      "options": [
        {
          "name": "Full Fat",
          "description": "Full Fat",
          "additionalPrice": 0,
          "isActive": false,
          "order": 1
        },
        {
          "name": "Skim Milk",
          "description": "skim milk",
          "additionalPrice": 0,
          "isActive": false,
          "order": 2
        },
        {
          "name": "Lactose Free",
          "description": "Lactose Free",
          "additionalPrice": 0,
          "isActive": false,
          "order": 3
        },
        {
          "name": "Coconut Milk Small",
          "description": "Coconut Milk Small",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 4
        },
        {
          "name": "Coconut Milk Medium",
          "description": "Coconut milk Medium",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 5
        },
        {
          "name": "Almond Milk Small",
          "description": "Almond Milk Small",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 6
        },
        {
          "name": "Almond Milk Medium",
          "description": "Almond Milk Medium",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 7
        }
      ]
    },
    "coffee-milk-options-with-large": {
      "name": "Milk",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 3,
      "options": [
        {
          "name": "Full Fat",
          "description": "Full Fat",
          "additionalPrice": 0,
          "isActive": false,
          "order": 1
        },
        {
          "name": "Skim Milk",
          "description": "skim milk",
          "additionalPrice": 0,
          "isActive": false,
          "order": 2
        },
        {
          "name": "Lactose Free",
          "description": "Lactose Free",
          "additionalPrice": 0,
          "isActive": false,
          "order": 3
        },
        {
          "name": "Coconut Milk Small",
          "description": "Coconut Milk Small",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 4
        },
        {
          "name": "Coconut Milk Medium",
          "description": "Coconut milk Medium",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 5
        },
        {
          "name": "Almond Milk Small",
          "description": "Almond Milk Small",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 6
        },
        {
          "name": "Almond Milk Medium",
          "description": "Almond Milk Medium",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 7
        },
        {
          "name": "Almond Milk Large",
          "description": "Almond Milk Large",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 8
        },
        {
          "name": "Coconut Milk Large",
          "description": "Coconut Milk Large",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 9
        }
      ]
    },
    "coffee-milk-options-americano": {
      "name": "Milk",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 3,
      "options": [
        {
          "name": "Full Fat",
          "description": "Full Fat",
          "additionalPrice": 0,
          "isActive": false,
          "order": 1
        },
        {
          "name": "Skim Milk",
          "description": "skim milk",
          "additionalPrice": 0,
          "isActive": false,
          "order": 2
        },
        {
          "name": "Lactose Free",
          "description": "Lactose Free",
          "additionalPrice": 0,
          "isActive": false,
          "order": 3
        },
        {
          "name": "Coconut Milk Small",
          "description": "Coconut Milk Small",
          "additionalPrice": 150000,
          "isActive": false,
          "order": 4
        },
        {
          "name": "Coconut Milk Medium",
          "description": "Coconut milk Medium",
          "additionalPrice": 150000,
          "isActive": false,
          "order": 5
        },
        {
          "name": "Almond Milk Small",
          "description": "Almond Milk Small",
          "additionalPrice": 150000,
          "isActive": false,
          "order": 6
        },
        {
          "name": "Almond Milk Medium",
          "description": "Almond Milk Medium",
          "additionalPrice": 150000,
          "isActive": false,
          "order": 7
        },
        {
          "name": "Almond Milk Large",
          "description": "Almond Milk Large",
          "additionalPrice": 150000,
          "isActive": false,
          "order": 8
        },
        {
          "name": "Coconut Milk Large",
          "description": "Coconut Milk Large",
          "additionalPrice": 130000,
          "isActive": false,
          "order": 9
        }
      ]
    },
    "coffee-add-ons": {
      "name": "Add-ons",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 4,
      "options": [
        {
          "name": "Caramel",
          "description": "Caramel",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 1
        },
        {
          "name": "Caramel Sugar Free",
          "description": "Caramel",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 2
        },
        {
          "name": "Vanilla",
          "description": "Vanilla",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 3
        },
        {
          "name": "Vanilla Sugar Free",
          "description": "Vanilla",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 4
        },
        {
          "name": "Hazelnut",
          "description": "Hazelnut",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 5
        },
        {
          "name": "White Mocha",
          "description": "White mocha",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 6
        },
        {
          "name": "Mocha",
          "description": "Mocha",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 7
        },
        {
          "name": "Whipped Cream",
          "description": "Whipped Cream",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 8
        },
        {
          "name": "Caramel Drizzle",
          "description": "Caramel Drizzle",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 9
        },
        {
          "name": "Chocolate Drizzle",
          "description": "Chocolate Drizzle",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 10
        },
        {
          "name": "Chocolate Chips",
          "description": "Chocolate Chips",
          "additionalPrice": 100000,
          "isActive": false,
          "order": 11
        }
      ]
    },
    "matcha-size": {
      "name": "Choose Size",
      "description": "",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Small",
          "description": "S",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Medium",
          "description": "M",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Large",
          "description": "Large",
          "additionalPrice": 110000,
          "isActive": false,
          "order": 3
        }
      ]
    },
    "tea-size-hot": {
      "name": "Choose Size",
      "description": "",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Medium",
          "description": "Medium",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        }
      ]
    },
    "tea-size-iced": {
      "name": "Choose Size",
      "description": "Choose Size",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Small",
          "description": "Small",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Medium",
          "description": "Medium",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Large",
          "description": "Large",
          "additionalPrice": 100000,
          "isActive": false,
          "order": 3
        }
      ]
    },
    "tea-extra-bag": {
      "name": "Tea Bags",
      "description": null,
      "isRequired": false,
      "maxSelections": null,
      "order": 2,
      "options": [
        {
          "name": "Extra Bag",
          "description": "bag",
          "additionalPrice": 50000,
          "isActive": false,
          "order": 1
        }
      ]
    },
    "tea-water-concentration": {
      "name": "Water Concentration",
      "description": "Water Concentration",
      "isRequired": false,
      "maxSelections": 1,
      "order": 2,
      "options": [
        {
          "name": "Normal",
          "description": "Normal",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Light",
          "description": "Light",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Extra",
          "description": "Extra",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3
        },
        {
          "name": "No water",
          "description": "No water",
          "additionalPrice": 0,
          "isActive": true,
          "order": 4
        }
      ]
    },
    "tea-ice-options": {
      "name": "Ice",
      "description": "Ice",
      "isRequired": false,
      "maxSelections": 1,
      "order": 3,
      "options": [
        {
          "name": "Normal",
          "description": "Normal",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Light",
          "description": "Light",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Extra",
          "description": "Extra",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3
        },
        {
          "name": "No ice",
          "description": "No ice",
          "additionalPrice": 0,
          "isActive": true,
          "order": 4
        }
      ]
    },
    "tea-peach-juice": {
      "name": "Peach Juice",
      "description": "Peach Juice",
      "isRequired": false,
      "maxSelections": 1,
      "order": 4,
      "options": [
        {
          "name": "Normal",
          "description": "Normal",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Light",
          "description": "Light",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Extra",
          "description": "Extra",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3
        }
      ]
    },
    "pastry-warming-options": {
      "name": "Warming",
      "description": "Warming",
      "isRequired": false,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Warmed",
          "description": "Warmed",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Not warmed",
          "description": "Not warmed",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        }
      ]
    },
    "water-temperature-options": {
      "name": "Temperature",
      "description": "Temperature",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "Room Temperature",
          "description": "Room Temperature",
          "additionalPrice": 0,
          "isActive": false,
          "order": 1
        },
        {
          "name": "Cold Water",
          "description": "Cold Water",
          "additionalPrice": 0,
          "isActive": false,
          "order": 2
        }
      ]
    },
    "sandwich-bread-options": {
      "name": "Bread",
      "description": "Choose your bread type",
      "isRequired": true,
      "maxSelections": 1,
      "order": 1,
      "options": [
        {
          "name": "White Bread",
          "description": "Regular white bread",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Brown Bread",
          "description": "Whole wheat brown bread",
          "additionalPrice": 50000,
          "isActive": true,
          "order": 2
        }
      ]
    },
    "sandwich-ingredients-base": {
      "name": "Ingredients",
      "description": "Choose your ingredients",
      "isRequired": false,
      "maxSelections": null,
      "order": 2,
      "options": [
        {
          "name": "Rocca",
          "description": "Fresh rocca leaves",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Cheddar Cheese",
          "description": "Cheddar cheese slice",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Mint",
          "description": "Fresh mint leaves",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3
        },
        {
          "name": "Onion",
          "description": "Sliced onion",
          "additionalPrice": 0,
          "isActive": true,
          "order": 4
        },
        {
          "name": "Pepper",
          "description": "Bell pepper slices",
          "additionalPrice": 0,
          "isActive": true,
          "order": 5
        },
        {
          "name": "Cherry Tomatoes",
          "description": "Fresh cherry tomatoes",
          "additionalPrice": 0,
          "isActive": true,
          "order": 6
        },
        {
          "name": "Jalapeno",
          "description": "Spicy jalapeno slices",
          "additionalPrice": 0,
          "isActive": true,
          "order": 7
        },
        {
          "name": "Lettuce",
          "description": "Fresh lettuce leaves",
          "additionalPrice": 0,
          "isActive": true,
          "order": 8
        },
        {
          "name": "Olives",
          "description": "Sliced olives",
          "additionalPrice": 0,
          "isActive": true,
          "order": 9
        },
        {
          "name": "Pickles",
          "description": "Pickle slices",
          "additionalPrice": 0,
          "isActive": true,
          "order": 10
        },
        {
          "name": "Turkey",
          "description": "Turkey slices",
          "additionalPrice": 0,
          "isActive": true,
          "order": 11
        }
      ]
    },
    "sandwich-toppings": {
      "name": "Toppings",
      "description": "Choose your toppings",
      "isRequired": false,
      "maxSelections": null,
      "order": 3,
      "options": [
        {
          "name": "Mayo",
          "description": "Mayonnaise",
          "additionalPrice": 0,
          "isActive": true,
          "order": 1,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        },
        {
          "name": "BBQ",
          "description": "BBQ Sauce",
          "additionalPrice": 0,
          "isActive": true,
          "order": 2,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        },
        {
          "name": "Honey Mustard",
          "description": "Honey Mustard Sauce",
          "additionalPrice": 0,
          "isActive": true,
          "order": 3,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        },
        {
          "name": "Mustard",
          "description": "Mustard",
          "additionalPrice": 0,
          "isActive": true,
          "order": 4,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        },
        {
          "name": "Salt",
          "description": "Salt",
          "additionalPrice": 0,
          "isActive": true,
          "order": 5,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        },
        {
          "name": "Pepper",
          "description": "Pepper",
          "additionalPrice": 0,
          "isActive": true,
          "order": 6,
          "suboptions": [
            {
              "name": "Less",
              "additionalPrice": 0
            },
            {
              "name": "Regular",
              "additionalPrice": 0
            },
            {
              "name": "Extra",
              "additionalPrice": 0
            }
          ]
        }
      ]
    },
    "sandwich-extras": {
      "name": "Extras",
      "description": "Add extra ingredients",
      "isRequired": false,
      "maxSelections": null,
      "order": 4,
      "options": [
        {
          "name": "Cheddar Cheese",
          "description": "Extra cheddar cheese",
          "additionalPrice": 100000,
          "isActive": true,
          "order": 1
        },
        {
          "name": "Chicken Teriyaki",
          "description": "Extra chicken teriyaki",
          "additionalPrice": 150000,
          "isActive": true,
          "order": 2
        },
        {
          "name": "Tuna",
          "description": "Extra tuna",
          "additionalPrice": 200000,
          "isActive": true,
          "order": 3
        },
        {
          "name": "Roast Beef",
          "description": "Extra roast beef",
          "additionalPrice": 150000,
          "isActive": true,
          "order": 4
        },
        {
          "name": "Beef Ham",
          "description": "Extra beef ham",
          "additionalPrice": 150000,
          "isActive": true,
          "order": 5
        }
      ]
    }
}

export function resolveVariantGroups(groupIds = []) {
  return groupIds
    .map((id) => ({ id, ...variantCatalog[id] }))
    .filter(Boolean)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function formatLL(n) {
  return `L.L ${Number(n || 0).toLocaleString()}`;
}