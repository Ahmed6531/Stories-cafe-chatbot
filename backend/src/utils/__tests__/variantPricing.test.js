import {
  enrichSelectedOptionsWithGroupMetadata,
  sortSelectedOptionsForDisplay,
} from '../variantPricing.js';

describe('enrichSelectedOptionsWithGroupMetadata', () => {
  const variantGroups = [
    {
      groupId: 'coffee-size-standard',
      name: 'Choose Size',
      options: [
        { name: 'Small', order: 1 },
        { name: 'Medium', order: 2 },
      ],
    },
    {
      groupId: 'coffee-espresso-options',
      name: 'Espresso Options',
      options: [
        { name: 'Shot Decaffe', order: 1 },
        { name: 'Add Shot', order: 2 },
      ],
    },
  ];

  test('infers group metadata for chatbot selections without groupId', () => {
    const orderedSelections = sortSelectedOptionsForDisplay(
      [{ optionName: 'Medium' }, { optionName: 'Shot Decaffe' }],
      variantGroups,
    );

    expect(enrichSelectedOptionsWithGroupMetadata(orderedSelections, variantGroups)).toEqual([
      {
        optionName: 'Medium',
        groupId: 'coffee-size-standard',
        groupName: 'Choose Size',
      },
      {
        optionName: 'Shot Decaffe',
        groupId: 'coffee-espresso-options',
        groupName: 'Espresso Options',
      },
    ]);
  });

  test('preserves explicit groupId when it is already present', () => {
    expect(
      enrichSelectedOptionsWithGroupMetadata(
        [{ optionName: 'Medium', groupId: 'coffee-size-standard' }],
        variantGroups,
      ),
    ).toEqual([
      {
        optionName: 'Medium',
        groupId: 'coffee-size-standard',
        groupName: 'Choose Size',
      },
    ]);
  });
});
