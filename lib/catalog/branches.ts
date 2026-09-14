import type { Branch } from "./types";

/**
 * The NYBB Hot Wings branches, as published in the live site's footer.
 *
 * Deliberately absent: Ayala Malls Central Bloc. That was the Sports Lounge,
 * which closed in August 2026. The live site still lists it. This one does not.
 *
 * In Phase 1 these become `branches` rows, all with is_active = false except
 * the single pilot. The pilot has not been chosen yet: it is question 1 in
 * spec section 28 and only the owner can answer it, so nothing here is marked
 * as the launch branch.
 *
 * `pin` is read off each branch's own Google Maps listing, checked on
 * 2026-09-14 against the address printed here. Two are missing on purpose.
 * Shell Cebu Country Club and Shell Naga have no listing of their own, and a
 * search for their street returns several Shell forecourts each, so choosing
 * one would be a guess dressed as a location. They map from their address
 * until somebody who has stood at the counter confirms the pin.
 *
 * `format` is not decoration. A petrol forecourt, a mall food hall and a
 * hospital kiosk have different pickup behaviour, which is why prep_minutes and
 * pickup_slot_capacity live per branch rather than in global settings.
 */
export const branches: Branch[] = [
  {
    slug: "mango-avenue",
    name: "NYBB Hot Wings, Mango Avenue",
    shortName: "Mango Avenue",
    addressLine: "Gen. Maxilom Avenue (Mango Avenue)",
    city: "Cebu City",
    phones: ["0906-440-5297"],
    imageKey: "branch-mango-avenue",
    format: "street",
    pin: { lat: 10.3107153, lng: 123.8962067 },
  },
  {
    slug: "garden-bloc",
    name: "NYBB Hot Wings, Central Bloc",
    shortName: "Central Bloc, IT Park",
    addressLine: "Central Bloc, Cebu IT Park, Lahug",
    city: "Cebu City",
    phones: ["0906-331-3631", "(032) 318-2405"],
    format: "street",
    pin: { lat: 10.3311738, lng: 123.9058611 },
  },
  {
    slug: "shell-gorordo",
    name: "NYBB Hot Wings, Shell Gorordo",
    shortName: "Shell Gorordo",
    addressLine: "839 Gorordo Avenue",
    city: "Cebu City",
    phones: ["0917-114-1392"],
    format: "petrol",
    pin: { lat: 10.3203694, lng: 123.8994126 },
  },
  {
    slug: "shell-cebu-country-club",
    name: "NYBB Hot Wings, Shell Mobility Cebu Country Club",
    shortName: "Shell Cebu Country Club",
    addressLine: "Gov. Cuenco Avenue, Kasambagan",
    city: "Cebu City",
    phones: ["0932-360-2916"],
    format: "petrol",
  },
  {
    slug: "shell-north-gateway",
    name: "NYBB Hot Wings, Shell North Gateway",
    shortName: "Shell North Gateway",
    addressLine: "JP Rizal North Road, Labogon",
    city: "Mandaue City",
    phones: ["0906-538-1220"],
    format: "petrol",
    pin: { lat: 10.3523453, lng: 123.9498601 },
  },
  {
    slug: "shell-naga",
    name: "NYBB Hot Wings, Shell Mobility Naga",
    shortName: "Shell Naga",
    addressLine: "Uling Road",
    city: "Naga, Cebu",
    phones: ["0946-352-0538"],
    format: "petrol",
  },
  {
    slug: "chong-hua-medical-mall",
    name: "NYBB Hot Wings, Chong Hua Medical Mall",
    shortName: "Chong Hua Medical Mall",
    addressLine: "Don Julio Llorente corner C. Rodriguez",
    city: "Cebu City",
    phones: ["0969-328-2875"],
    format: "hospital",
    pin: { lat: 10.3101696, lng: 123.8899021 },
  },
  {
    slug: "nustar",
    name: "NYBB Hot Wings, NUSTAR",
    shortName: "NUSTAR",
    addressLine: "NUSTAR Resort, South Road Properties",
    city: "Cebu City",
    phones: ["0917-790-0243"],
    format: "casino",
    pin: { lat: 10.2715457, lng: 123.8802395 },
  },
  {
    slug: "sm-city-cebu",
    name: "NYBB Hot Wings, SM City Cebu Food Hall",
    shortName: "SM City Cebu",
    addressLine: "SM City Cebu Food Hall",
    city: "Cebu City",
    phones: ["0917-790-0386"],
    imageKey: "branch-sm-city",
    format: "food-hall",
    pin: { lat: 10.3120356, lng: 123.9179292 },
  },
];

export const branchFormatLabel: Record<Branch["format"], string> = {
  street: "Street front",
  mall: "Mall",
  "food-hall": "Food hall",
  petrol: "Petrol station",
  hospital: "Medical mall",
  casino: "Resort",
};
