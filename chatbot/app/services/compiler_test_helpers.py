def fake_variant_group(group_id: str, name: str, options: list[tuple[str, str | None]]) -> dict:
    built_options = []
    for option_name, suboption_name in options:
        option = {"name": option_name, "isActive": True}
        if suboption_name is not None:
            option["suboptions"] = [{"name": suboption_name, "isActive": True}]
        built_options.append(option)
    return {
        "groupId": group_id,
        "customerLabel": name,
        "name": name,
        "isActive": True,
        "options": built_options,
    }


def fake_menu_detail(id: int, name: str, groups: list[dict]) -> dict:
    return {
        "id": id,
        "name": name,
        "isAvailable": True,
        "variantGroupDetails": groups,
    }


def fake_menu_item(
    id: int,
    name: str,
    available: bool = True,
    variant_groups: list[dict] | None = None,
) -> dict:
    return {
        "id": id,
        "name": name,
        "isAvailable": available,
        "variantGroupDetails": list(variant_groups or []),
    }
