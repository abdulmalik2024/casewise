from casewise_api.building import extract_address


def test_detects_nyc_addresses():
    assert extract_address(
        "My client's landlord at 350 Albany Avenue, Brooklyn wants to raise the rent 8%"
    ).startswith("350 Albany Avenue")
    assert extract_address("The building at 2854 Third Ave in the Bronx has violations")
    assert extract_address("Tenant lives at 41-20 54th St, Queens")


def test_ignores_non_addresses():
    assert extract_address("How much notice before an 8% rent increase?") is None
    assert extract_address("Under RPAPL 711 a 14 day demand is required") is None
    assert extract_address("The 2019 amendments changed section 226-c") is None
