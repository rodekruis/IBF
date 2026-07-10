import { addDays } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

const ETH_G5173_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAANoAAACQCAAAAABLtSoNAAAD40lEQVR4nO3ay24kNRQG4P9cXK7q3CaCYXZIsOEiISEWs+UhEG/BkgUPy4o9IyFBQneVj5E7g0hG6UqnidJl53ybKO1Ky44v59hlwLk69WiRYrg401MAgu52wY+/YLFoj2dYNyToxpHAkA0aEvCKzlki7fN/WA7a66m+H9cZCe0ZVnxSV48VigetJk62zmhPB7zR//pM0AyK4WPhwKgOP/RAmCilnOzWJ/VNu/sIKS4Bej8MJW7n5oD66aDaBQh/0MU/oHoDs54FsNCHEbDCuXeXcrciUd4vSiwMz5YKjwE8GSATmmqacsJfEkqv3Vohm2haThkxrydAcmNN4wRiSmyg+6faT1gwmisUkPJ1ZlCNWb/OlAXLiadMsCrXep4pi2baT8RgqTEp5tlSOv0TWc2SSVtNY2WiE6wZSqmNnPi9IeBU/j2lu0R1aHeRKKYhbRLCCKlwhZwhl1rCWYAgoi0KUJDStApH47xzggphKDuaxoSAMEiV0XprpuIMpJQq3Kg93LSp7GpAFW5nbswNt4wxqaTygqY1gq4ncIU51kMIEpilxDSp8YSOdxcFGBnn1EUm0tBSPqIsWhIxYQaIX2OZTg74m6AhblMSbFu42Pi2OuBvJDJzB0J5HRr5IyyT7Ii8cwGZQAkJRCY2/J2XehKZdnw+M8yEzEpwM0LKCPwHmqHlqJ8YKMvI3TsVS9M9stfI9GaaWUn90yGz9blsHtk0601uUsgSsfkKleHdReVVaMzlRLwsIHVFbJpfISlbKu+wbftgXYf++YHMn3qkbSryJfj8oMi41GtyIdxkIRoFMS7/APkTnNK+h3VCli0jGswob2ddTXh3kRBnFsqbaYKqBTR1xEpkE02SoJmWmmcdtl+jjYGyskaki+qOf3h3kXHuAP16Stkk/m7tDMhep4mIyFLEVRiBdprWsWVkNiGbZFytUzsDkvEFZ0pyvpksy1VqqNeiMfGGx7N1qm5xnG/ayYb7K7ayo6mzZdg1IL/JtrkmJAPRzU3BVnrtNb+LNJLljU4lcKNCevfXt+9+BS4/td+uo4wpbO96TtVlj/f5/P1P/mrQ+GroL/rY1TkaZ/B3Ihr7i6DVXjWmXQWBkBMFSmMLw/GWs+3iGfoQVVaL34Q+HlN3Ai0nkc35lssx63HrUM2JzDK8RTO0ufj1UjGarf3589XDObcnaXcRpKf6IufcS6XHroB7PF/7nXupKSTq3ki7/2XRd1yday43Xh27Hs69gND//bEr4A5Q3dVk55x7Jp+hXT8fuwLO3eZbtRopmt1nvXmi73HuSfjxsXPOOeecc65hq2NXwDnnnHNYqn8AMIHazjeMIQgAAAAASUVORK5CYII=';

const UGA_AKOKORIO_FLOOD_DEPTH_BASE64 =
  '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';

const MWI_SINOYA_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAOsAAAD7CAAAAACutzySAAABxElEQVR4nO3aUW7CQAyE4cHqFZNDOod0lVChoCZBqoAUz/9JvKA87Mi7ZjesBAAAAAAAAAAAALxeVT585qIu6mGYi9ooTZLG/QdCnQyDDqbyl9pYpujjVduIVVgAHXpTyCdsqJtBPvYPAf3quq9f1vkA0P6c82OZwqNHXce5PWVVmuyMs6qWTxq9mCmfsFnVujet5V2b6teb1u7bce+sGtf74+ZZZ+mSdVwdBnr3plnelm33umoOWi511a2yDllV05K20Xv/fZfrXz0ectkY9+9Ns9GnrJor63PiUa5PPN2VyXq9csoKAAAAOEmnvX/KRjrV1UeePQC8QBqVNX9/1bU3pXyyyijrIB9lVFcAn92cQj5CPkI+Qj2lfBS9CZ+ufHrTlq5Z0yirNiZx36xG0umyZVldtizj9Rpqa9p8mWhyPTrUWcpGGU1i3YftPYcnGSmfuqKnPHsAAAAA+Of7wzhlHMAfpazfq4WammSkfOq6oW/WSUby7AEAAAAAJ0jZMIoKAB/WhUOt8IPT02Fd433jwHMdXgQP+Qj5CPn8iRPvGweei94EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6Ng3431fJl76gBIAAAAASUVORK5CYII=';

const KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAANAAAACrCAAAAAAyKk2qAAADBUlEQVR4nO3c7XGjMBAG4L3MVfBeC1vD1qCrQTVQA3MluAb34EkJmZRwoYQbariRII6/YrCxERLv88cGY6KVVhLmIyJEREREtGC49uFPyQnQXI0mMypFQeoC0C0NpANb08wgJYGVFU9xLHUB6CqVG/2Q5VJpWynId2MbJEuZFnsdY5sWFg8R0afV/xDVfVUQERERUQGHdi9SEpUyqBRKUxeABqgoG4loAp3yZZpa5ZAiIHUBaH2QugD0MFrcDzxkE5CN26yo+06kjzqPFrpBQQG1UhZNXQAqDlIXgAahwEbS1AWgFbJxW1RSCk1dACqNL6d3dDZyBy93mmMuf3tqRM7qg4FFl30IidGDeR+RuzpoYrnTmO9b8KCIquJDMJg8DcwSN7BP3N1321jXW93kJzHmmxl3sh03xLhNyL4HthFiOj/W3+r2E7OxrmsfFlyt+8L6MJacDjtuKO3Qv1aJs/lzJxYz0YVFc1qd1fhgoqnbdjtKOrG6rw7lfVWF/lXHAmlMXv2qs7fNxfhwtHYXR6MFHSocNoOTrVq9H0L8rh7uJr7fxJZySH1U34i1bYYqvLEQ4tlsED18PHgmBVTUpNqF/IRtz3oXxN99JJZCP9zV8b1Z6Ca22Vglug3ZWBl0+mQ9q0tjqXkv8P/ie8XJTVZZZWDHHbRaYFAJqRnByWmI2VGpwjSN7kwjwkStGT7cfggtEC4AQZqwqGjxbvKea0DVR9PUf9yrdjG1om0T5jRIi/ccA+ppo02Mx8VmkkYlrMn3kmQjvyX8jwX8kqaJgcBO4smrhSIvH3iNrRVS7kIvyoZJOIg4mrVKe6jfSguIiNYLqQuQCazs79JoGL8p0eoySpd1dgqP2EW/E9gC4sC3n9zDzX+6DaNXLh4uL5wGMy1tntJCmO1L8+5cr3YVukVW14NyggftZ38ZhRI10vAN5TyDmFKeM4CmGhhe5ClVj9PLNrL2B9Ay6gsqGcOINUuGo5fu/cEhLgqYX7SLJt80g5wV//KdfEREREREREREREREJJ3/BGJyqr983tsAAAAASUVORK5CYII=';

const PHL_NIA_PUMPING_STATION_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGcAAACKCAAAAACS8At5AAAEa0lEQVR4nO2YbWxTVRjH/+vadV27tqtrceK20nVFs83aTebEgXMw5IMDtylRoigMiQERnRBETXAm+sFoAMFgjCzE6KKBDwsQfImF4IwDUphzs+JKKVu9qc1q27S7LZRaTJmaYHi597bniOb+PjXNc/Pr85ynzzn3ACIiIiIiIiIALJlUQcI9dDWtaldQ8nyQUeW4M3fLc6DCsU/JO2YAKAUdbJQ8Ijc41ko6njw1/ld0/9s/4L/IDmAJjf10uBi1JRQ8Kbllu0+oR8o99FSMEWoBn3wWFICK54Cejkf7PeiwUSb82RwesUur2Dcp1A31EcEa8PGkPKDDC4ZGGvnAODc4O5+8Z53jXt+Zc+Q9TO67nbUg7lnlDna9fY78HB2pDgRWWKPle8l6FrV/42d6oBkDWU+7S1plAe6PBR1k587mZBErOxIeYQnm88gsdrT7pYSaUZwWpLm835ZeJah9u9QVskE24S9k3YI0l+fTi/w/+7Z18cq/vuwZk0SDZZEiQG4IeuLSZDb+P1MaKw6uNC/Z+nIZ8GHdkDTokGt0KRYTe+LFEWEaXKMPjAv3dCijt8Vlw/KeVWqtrzjutQ2Onsi6B7hnAM015mR43+A6p5n1s/MOqyInY9mfOwPAoY/sk4WDKFP48+Ls0MUCH68Bz6OvQ3196RhG96vX4LpPGVT+ACFw+XlJYEf5gzpLUuUaz8kRdhjh+D/1nHetyD04qWHUzAVBHu5z5/bSms+dbeHDgjQ89p94a9IwbeIMSHvOrjXXS2/+jbgHWDukKjtPfj8FKm7qvUDDk+gTNgxuVDYYbxF6ruLNPP6PpOE9FhcJ8/DmF0qeSxeyFOoWmAM6fPn3CYUoO9+joqkAvl7zBAVR8vh0Gn3QsH54OQ3P0WNfpPAY4XmdpkY70KUlex8yxfK6vG8HFccJ5yPZNaoMf5zi+RR/T8pn3XciZTxL2oNm3BV9Ujr0CciyEDjwkNzx2jOOesJ9AGwcVsa867f8mABpTHjq0Ou69Kc8gvkAmFMYP23sBzCd4x2wwNeZk+ObqyuAO5sjIOixKDtNLYrdMx82IfpASyGRvk4zCpR1LfAx9hDu8MolBNcHaNMl4kzAVWRJDifIrQ+gckrD8khuyNpRlV9J0INNksaL1tlar2aZzUXQM3nk6HcvmpSqsdLgEAh61N5ayaby1dMUUMZI9kHu74uZJvvzTO8Ip3DBHsAkrbu13+PnFiy8D+B7q8Gt7+EYnEE+y4IlNo2do0jQPJhCn2r7zMd1Y82gbttO/fSz4lkQzyfpaGhVoyhEOh9g5kS/h+NrSkaer6rG7FedbdrseZxPV+pHrrRCqkt7e5bWB3DvTDn3/vOGRDUJTJYE4H2U3Y9sMev9plcNV/h+PqQCDuHXwtDYma7S9chofdLczRbMBwXP/kqW65knM9YAbXiDgqjpFTc2bCVdN6A60jtu7gB5uvXvtFDQALuuH5LRPJiiJpU+0FOgk47mcToayARdxIiIiIiIgA9/ADaaQAEwLyq9AAAAAElFTkSuQmCC';

const SSD_G5100_FLOOD_DEPTH_BASE64 =
  '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';

const ZMB_NGWERERECONFLUENCE_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAN4AAAFzCAAAAAB0+ejvAAAGvElEQVR4nO3ca2/cuBUG4PfwpovtxE7WySZIs5u0WXS3KIotUBQB+v//QIF+7Kcs0DRAsrl4JFHiYSHbuTgbu76MRzPK+3zwSCOJ5hmKFElpBjiHh7s72EzmHPs8jr+GfczY0/v3MGffYJbq9wvfG2ADK6A7e/Pi6OXmfauQt5htCd4Cbox/5qu6OXUOiE5T7syy1/LejfbDdWKO4dl+8ftrzArRlf2Eeda9Y68x5/C259n1PNPPmKet25hZ3Tu2+8P498BtH67dwcw8KQH8yXvAfnjPfxz/bjwL/A1b49LRPNPD+0+LCvP1FPgec/YI8/fnTyrjDO2cWJtPW3Ombx+evZ2IznblpuLHqyZA16ueXQj1VPmgpWI5EhFdzlfQftaYq3rqDBARERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER0Zr5GfO2PXUG6GoqzFKNWarxFainzgBN6q+3MEvu6KX/4/PKpX8+KZIu9Best7vPz72rfFh64NO22EWf+/YVZlZ6AJ496oxG424DJ8PzfuugtRrQ7L8ATHa+94Abjjcvjhq2GIC2jO/fXbvw8Ap9b6z9V/fNuLbnpLFNMFa6xd0X+we3XpSDtQnbnUbb++Qa5MPA6o9Blo3d/RXrRD4u7lqJsdLXx6vftVv9O9O5IDEdFGpseJkB3G7Qll0BaYvhk88GbYncmuwGxXqGB7jtrG/fr+yoeVc2QXyvorYrdraeJQBbNipcWwJqTqTUZoSsqcJiRVn3/QXDgy22/zu+1p9mUUy5yCirN+ojcO/l1jsdK574E/F1BaKW49KqwjuPkyWQjrN2IodZWwt0i5TH5uP5dvYGIjmHvj3c92jnHBHKocF6MZ+tv695n8pZIHlsE6PBjaDBBucLxOKwsIwF0HSlpB6pQrPA+MaKPL5geN2XdtIeHkkECMDb3A5NQnMcRFcWaMZz3MvQFmOV2FPsfZ7sdfn3/+lunzcfcSxEoEVKxhrR7rDQxotBEeFFkKIRoO0ldWEnm08b1eu0uEB4D8+RXtvClgGV1bGetSl2RdRsCwcty6b2pWQzXuMD1mGOSS6WlIR+R60iojdaALbxgxaxGNCbgKYaYuGGQayRzpyj3b525mK7W1ea1LTqbIECFgehE4iLqpUCe51zPvc5aLPQExf9qchF98+SvcPuG9dpHzSHjK7UwafsgaaOXiJ8zqaDy2nsBmxWeIeklBzelrmv+87ef67JyaAmVRhcJyYkRS9qJcvk56e5zEHODLl1samdfOt/yVqmAYU87DrsmSyLKEmyl7G/M/VkirnMMR7GmuzvD1igC1Y7UXsXz8Skl3dcNK6zxvWDF3Xnu8Iv1urk9BV6hVfTiYRmvAK0KGPOHjpUSdVmLZpxyrUrVCOmZC5xTH6z6FNhRYrKSUaHTsw4zO2HDBWHIEWqPHoUmt3YkdmwpgWAs6FGo72HxuQ19FlLRBelWgRN2YSYqtSbUoacv9jRWw1zyeNy1x4cWOuS9kE0jBeDnE1fmt6Ig2QkO/biFHWIxWaVXpGtau+900qT5ndVrzlLrlPMLiGLmMGrGWAhKIKGt9c+AqxP+w+X6VqoaU1Cj65MvimjxXB456bNxlhBTmpCH3LRafZaAy+uf4C0WGrdMx/nU3ZUXdJ2HOhDumxCl7Xa+8+dV2LGblnwqrKKecV6sbzw7Jd6W3VnNUuSsqtTlgS5+SaY6NzrYeNaTvelLBdDtiYGLZts4IFu1/YHiklnPuVyR41Tgr9Rj9f3cRoGXjO0KEz8MO+2AvXSWrDfnbbB14etlQ++Hi85K5x1+bIlD8qkNToASVI/nhfTj4iWbRwprA+z5PTGTujGhxdOT2+tCg+XC2//1C1xaVNk9XRNSzrl/SBx8vmHq3tw2obbIjDiw8pmcVfMCiSgLmb68Iszq7q7MI3ponuygv+xdWvWn/bB5L3Ma3X78I7mbEsvHd6Pps20j1mfnA5zdgOzLr0Bc/UAwD3MklteUncxc7vA/g8XPch7bJrds4eXD1aZF1qivzxaZmprMvB+/B3wjxXnhYg2Xj11BjbLTcxYPXUG6DdYJkRERERERET0mXk/M4fZx0dfvXopn4D56j/Hi9q58BFEtBRr9sDxatSreBJ/Il9lgW6i8HHx75jjQ552fW6kmmtI8/jbfUc/TbBe38ZcHvZmZ+HR1BkgOmPEd+pvTGyiLczZHzBn21NngC5rHfqZRESEK/gf27Qk/7TTsKYAAAAASUVORK5CYII=';

// This basic flood extent is used for any additional events per country, in addition to the realistic/pipeline-based one above.
// The image is the same for every event/country, just the extent changes (below).
const MOCK_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAUCAYAAABSx2cSAAAA0ElEQVR4AaXBsW0jQRREwXezedDpNNpmTDTXZEy0OxLa7fwIpFvgCAjCeVP153a7fd3vdy6Px4OP5/PJ5fV68X6/+Z/FhmNmzrZIIgm2udgmCZJoy8zw22LDYsMBnDNDWySRBNtcbJMESbRlZvhpsWGxYbHhAE7+mhnaIokk2OZimyRIoi0zw8diw2LDAZz8MzO0RRJJsM3FNkmQRFtmhstiw2LDAZz8MDO0RRJJsM3FNkmQRFtmhsWGxYbFhgM4+WVmaIskkmCbi22SIIm2fANUaHZa8hEamQAAAABJRU5ErkJggg==';

const MOCK_BUILDERS: Record<string, MockCountryBuilder> = {
  ETH: buildEthiopiaAlerts,
  UGA: buildUgandaAlerts,
  MWI: buildMalawiAlerts,
  KEN: buildKenyaAlerts,
  PHL: buildPhilippinesAlerts,
  SSD: buildSouthSudanAlerts,
  ZMB: buildZambiaAlerts,
};

export const SUPPORTED_MOCK_COUNTRIES = Object.keys(MOCK_BUILDERS);

type MockCountryBuilder = (issuedAt: Date) => AlertCreateDto[];

function buildEthiopiaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'awash-metehara',
      centroid: { latitude: 8.9, longitude: 39.9 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        },
        ...Array.from({ length: 5 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 12400,
          },
          {
            placeCode: 'ET020302',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8300,
          },
          {
            placeCode: 'ET020303',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5600,
          },
          {
            placeCode: 'ET020101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15200,
          },
          {
            placeCode: 'ET020103',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'ET020104',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3400,
          },
          {
            placeCode: 'ET020105',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 7800,
          },
          {
            placeCode: 'ET0203',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 26300,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 35500,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 61800,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 61800,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 39.0, ymin: 8.0, xmax: 40.5, ymax: 10.0 },
          },
        ],
      },
    },
    {
      eventName: 'baro-gambella',
      centroid: { latitude: 8.25, longitude: 34.59 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 3),
            end: addDays(issuedAt, 10),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        },
        ...Array.from({ length: 3 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 3),
            end: addDays(issuedAt, 10),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET120201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4200,
          },
          {
            placeCode: 'ET120202',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3100,
          },
          {
            placeCode: 'ET120203',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1800,
          },
          {
            placeCode: 'ET1202',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'ET12',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 9100,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 33.5, ymin: 7.5, xmax: 35.0, ymax: 9.0 },
          },
        ],
      },
    },
    {
      eventName: 'G5173',
      centroid: { latitude: 2.85, longitude: 37.45 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET041207',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 29,
          },
          {
            placeCode: 'ET041212',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 734,
          },
          {
            placeCode: 'ET0412',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 763,
          },
          {
            placeCode: 'ET04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 763,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_G5173_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 36.64625136835569,
              ymin: 4.0229000000145305,
              xmax: 38.46791804005322,
              ymax: 5.227900000013435,
            },
          },
        ],
      },
    },
  ];
}

function buildUgandaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Akokorio at Uganda Gauge',
      centroid: { latitude: 1.775, longitude: 33.875 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG20270101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 5,
          },
          {
            placeCode: 'UG20270110',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 39,
          },
          {
            placeCode: 'UG20460101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 17,
          },
          {
            placeCode: 'UG20460102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'UG20460103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 6,
          },
          {
            placeCode: 'UG20460104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'UG20460105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 5,
          },
          {
            placeCode: 'UG20460106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: 'UG20470101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 78,
          },
          {
            placeCode: 'UG20470103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 7,
          },
          {
            placeCode: 'UG20470104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 17,
          },
          {
            placeCode: 'UG20470105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'UG20470106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 9,
          },
          {
            placeCode: 'UG20470201',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 60,
          },
          {
            placeCode: 'UG20470202',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 22,
          },
          {
            placeCode: 'UG20470203',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 28,
          },
          {
            placeCode: 'UG20470204',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'UG30640101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'UG30640108',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 17,
          },
          {
            placeCode: 'UG30800101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 658,
          },
          {
            placeCode: 'UG30800102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 624,
          },
          {
            placeCode: 'UG30800103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 31,
          },
          {
            placeCode: 'UG30800104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 14,
          },
          {
            placeCode: 'UG30800105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3402,
          },
          {
            placeCode: 'UG30800202',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 17,
          },
          {
            placeCode: 'UG30800203',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 427,
          },
          {
            placeCode: 'UG30800204',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 45,
          },
          {
            placeCode: 'UG30900102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 79,
          },
          {
            placeCode: 'UG30900103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 93,
          },
          {
            placeCode: 'UG30900105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 283,
          },
          {
            placeCode: 'UG30900106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 594,
          },
          {
            placeCode: 'UG30900108',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 243,
          },
          {
            placeCode: 'UG202701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'UG204601',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 34,
          },
          {
            placeCode: 'UG204701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 115,
          },
          {
            placeCode: 'UG204702',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 114,
          },
          {
            placeCode: 'UG306401',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 19,
          },
          {
            placeCode: 'UG308001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4729,
          },
          {
            placeCode: 'UG308002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 489,
          },
          {
            placeCode: 'UG309001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1292,
          },
          {
            placeCode: 'UG2027',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'UG2046',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 34,
          },
          {
            placeCode: 'UG2047',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 229,
          },
          {
            placeCode: 'UG3064',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 19,
          },
          {
            placeCode: 'UG3080',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 5218,
          },
          {
            placeCode: 'UG3090',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1292,
          },
          {
            placeCode: 'UG2',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 307,
          },
          {
            placeCode: 'UG3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 6529,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_AKOKORIO_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 33.34708469241683,
              ymin: 1.635400000007607,
              xmax: 34.58541802917004,
              ymax: 3.3620666666727033,
            },
          },
        ],
      },
    },
    {
      eventName: 'lokok-karamoja',
      centroid: { latitude: 3.45, longitude: 34.5 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 6),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 2,
        },
        ...Array.from({ length: 3 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 6),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 2,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG30660101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3400,
          },
          {
            placeCode: 'UG30660102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2100,
          },
          {
            placeCode: 'UG30660103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'UG306601',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 7000,
          },
          {
            placeCode: 'UG3066',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 7000,
          },
          {
            placeCode: 'UG3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 7000,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 7000,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 33.8, ymin: 2.8, xmax: 35.2, ymax: 4.2 },
          },
        ],
      },
    },
    {
      eventName: 'mpologoma-kyankwanzi',
      centroid: { latitude: 1.1, longitude: 31.8 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 5),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 1.5,
        },
        ...Array.from({ length: 2 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 5),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 1.5,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG10120110',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG10120111',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 800,
          },
          {
            placeCode: 'UG10120112',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 600,
          },
          {
            placeCode: 'UG101201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2600,
          },
          {
            placeCode: 'UG1012',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 2600,
          },
          {
            placeCode: 'UG1',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 2600,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 2600,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 31.2, ymin: 0.5, xmax: 32.4, ymax: 1.7 },
          },
        ],
      },
    },
  ];
}

function buildMalawiAlerts(issuedAt: Date): AlertCreateDto[] {
  // NOTE: MWI currently has single threshold for both severity and probability, and therefore only 'high' alert-class is possible. Therefore only 1 event is mocked here.
  return [
    {
      eventName: 'Sinoya South',
      centroid: { latitude: -16.223, longitude: 35.307 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW30701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5,
          },
          {
            placeCode: 'MW30703',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 76,
          },
          {
            placeCode: 'MW307',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 81,
          },
          {
            placeCode: 'MW3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 81,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MWI_SINOYA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 35.11291803078778,
              ymin: -16.373766666651775,
              xmax: 35.308751364661944,
              ymax: -16.1645999999853,
            },
          },
        ],
      },
    },
  ];
}

function buildKenyaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'ATHI MUNYU (3DA02)',
      centroid: { latitude: -1.095, longitude: 37.194 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'KE0030150072',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 48,
          },
          {
            placeCode: 'KE0030150074',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 186,
          },
          {
            placeCode: 'KE0030160075',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 371,
          },
          {
            placeCode: 'KE0030160076',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2749,
          },
          {
            placeCode: 'KE0030170080',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 161,
          },
          {
            placeCode: 'KE0030170083',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1167,
          },
          {
            placeCode: 'KE0030170084',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3636,
          },
          {
            placeCode: 'KE0060260126',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'KE003015',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 234,
          },
          {
            placeCode: 'KE003016',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 3120,
          },
          {
            placeCode: 'KE003017',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 4964,
          },
          {
            placeCode: 'KE006026',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'KE003',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 8318,
          },
          {
            placeCode: 'KE006',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 44,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 38.45958470669687,
              ymin: -3.7354333333208416,
              xmax: 40.19458471148839,
              ymax: -2.3062666666554748,
            },
          },
        ],
      },
    },
  ];
}

function buildPhilippinesAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Nia Pumping Station',
      centroid: { latitude: 8.886, longitude: 125.541 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH160201000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 34744,
          },
          {
            placeCode: 'PH160202000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 250697,
          },
          {
            placeCode: 'PH160203000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 21300,
          },
          {
            placeCode: 'PH160204000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3579,
          },
          {
            placeCode: 'PH160205000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 524,
          },
          {
            placeCode: 'PH160207000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 13551,
          },
          {
            placeCode: 'PH160208000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 18728,
          },
          {
            placeCode: 'PH160209000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 12259,
          },
          {
            placeCode: 'PH160210000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2037,
          },
          {
            placeCode: 'PH160211000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8474,
          },
          {
            placeCode: 'PH160212000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2554,
          },
          {
            placeCode: 'PH160301000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1360,
          },
          {
            placeCode: 'PH160303000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 27529,
          },
          {
            placeCode: 'PH160306000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1233,
          },
          {
            placeCode: 'PH160309000',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 11451,
          },
          {
            placeCode: 'PH160200000',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 368447,
          },
          {
            placeCode: 'PH160300000',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 41573,
          },
          {
            placeCode: 'PH160000000',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 410020,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: PHL_NIA_PUMPING_STATION_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 125.16958286001241,
              ymin: 8.311250169469588,
              xmax: 126.03541618991946,
              ymax: 9.466250164820224,
            },
          },
        ],
      },
    },
  ];
}

function buildSouthSudanAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'G5100',
      centroid: { latitude: 6.208, longitude: 31.542 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 50,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 50,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'SS030301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1496,
          },
          {
            placeCode: 'SS030302',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5517,
          },
          {
            placeCode: 'SS030303',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 107012,
          },
          {
            placeCode: 'SS030304',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4194,
          },
          {
            placeCode: 'SS030305',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 16042,
          },
          {
            placeCode: 'SS030306',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 934,
          },
          {
            placeCode: 'SS031001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15503,
          },
          {
            placeCode: 'SS031002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 50445,
          },
          {
            placeCode: 'SS031003',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 10881,
          },
          {
            placeCode: 'SS031004',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 30002,
          },
          {
            placeCode: 'SS031005',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 16413,
          },
          {
            placeCode: 'SS040101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 530,
          },
          {
            placeCode: 'SS040102',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 341,
          },
          {
            placeCode: 'SS040104',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2903,
          },
          {
            placeCode: 'SS040105',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8362,
          },
          {
            placeCode: 'SS040106',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 13,
          },
          {
            placeCode: 'SS040107',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 7745,
          },
          {
            placeCode: 'SS040108',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9070,
          },
          {
            placeCode: 'SS040701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1029,
          },
          {
            placeCode: 'SS040702',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'SS040703',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 300,
          },
          {
            placeCode: 'SS040704',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 390,
          },
          {
            placeCode: 'SS040705',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 98,
          },
          {
            placeCode: 'SS040706',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 150,
          },
          {
            placeCode: 'SS0303',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 135195,
          },
          {
            placeCode: 'SS0310',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 123244,
          },
          {
            placeCode: 'SS0401',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 28964,
          },
          {
            placeCode: 'SS0407',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1969,
          },
          {
            placeCode: 'SS03',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 258439,
          },
          {
            placeCode: 'SS04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 30933,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: SSD_G5100_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 30.318751350720206,
              ymin: 5.849566666679536,
              xmax: 32.63291802377786,
              ymax: 7.449566666678081,
            },
          },
        ],
      },
    },
  ];
}

function buildZambiaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'NgwerereConfluence',
      centroid: { latitude: -15.2167, longitude: 28.5 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: '010100101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 155,
          },
          {
            placeCode: '010100102',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 22,
          },
          {
            placeCode: '010100103',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 18,
          },
          {
            placeCode: '010100104',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 33,
          },
          {
            placeCode: '010100105',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 188,
          },
          {
            placeCode: '010100106',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 13,
          },
          {
            placeCode: '010100207',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: '010100208',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 30,
          },
          {
            placeCode: '010100209',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 24,
          },
          {
            placeCode: '010100210',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 75,
          },
          {
            placeCode: '010100211',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 365,
          },
          {
            placeCode: '010100212',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 16,
          },
          {
            placeCode: '010100314',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 30,
          },
          {
            placeCode: '010100315',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 100,
          },
          {
            placeCode: '010100318',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 381,
          },
          {
            placeCode: '010100319',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 46,
          },
          {
            placeCode: '010100320',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: '010100321',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 37,
          },
          {
            placeCode: '010100322',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 315,
          },
          {
            placeCode: '010200402',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: '010200412',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: '010200413',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: '010200516',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 274,
          },
          {
            placeCode: '010200518',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: '010200519',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8,
          },
          {
            placeCode: '010200527',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: '020201611',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: '020201612',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 75,
          },
          {
            placeCode: '020201613',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: '020201614',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 29,
          },
          {
            placeCode: '020201622',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 160,
          },
          {
            placeCode: '020201623',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 421,
          },
          {
            placeCode: '020201624',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 40,
          },
          {
            placeCode: '020201625',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 39,
          },
          {
            placeCode: '020201626',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 21,
          },
          {
            placeCode: '020201701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 267,
          },
          {
            placeCode: '020201709',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 60,
          },
          {
            placeCode: '020201710',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 14,
          },
          {
            placeCode: 'ZM1001',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1424,
          },
          {
            placeCode: 'ZM1002',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 291,
          },
          {
            placeCode: 'ZM1003',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'ZM1007',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 429,
          },
          {
            placeCode: 'ZM2002',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1128,
          },
          {
            placeCode: 'ZM2003',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM10',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 2148,
          },
          {
            placeCode: 'ZM20',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 1129,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ZMB_NGWERERECONFLUENCE_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 27.137918008602426,
              ymin: -15.347933333319375,
              xmax: 28.992918013725344,
              ymax: -12.248766666655527,
            },
          },
        ],
      },
    },
  ];
}

export function buildMockForecast(
  countryCodeIso3: string,
  issuedAt: Date,
  alertsOverride?: AlertCreateDto[],
): ForecastCreateDto {
  let alerts: AlertCreateDto[];
  if (alertsOverride !== undefined) {
    alerts = alertsOverride;
  } else {
    const builder = MOCK_BUILDERS[countryCodeIso3];
    if (!builder) {
      throw new Error(
        `No mock event configuration for country '${countryCodeIso3}'. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
      );
    }
    alerts = builder(issuedAt);
  }

  return {
    issuedAt,
    hazardType: HazardType.floods, // TODO: for now we mock only flood events. To be extended later.
    forecastSources: [ForecastSource.glofas],
    countryCodeIso3,
    alerts,
  };
}
