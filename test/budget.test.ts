import { describe, it, expect } from "vitest";
import { parseBudget } from "../src/lib/budget.js";

describe("parseBudget", () => {
  it("разбирает диапазон без склейки (баг #5523148)", () => {
    const parsed = parseBudget("50 000 ₽ – 80 000 ₽");
    expect(parsed?.min).toBe(50000);
    expect(parsed?.max).toBe(80000);
    expect(parsed?.raw).toBe("50 000 ₽ – 80 000 ₽");
  });

  it("разбирает диапазон с коротким тире", () => {
    const parsed = parseBudget("45 000 ₽ – 50 000 ₽");
    expect(parsed?.min).toBe(45000);
    expect(parsed?.max).toBe(50000);
  });

  it("разбирает диапазон с обычным дефисом", () => {
    const parsed = parseBudget("10 000 - 20 000 руб");
    expect(parsed?.min).toBe(10000);
    expect(parsed?.max).toBe(20000);
  });

  it("разбирает «от X до Y»", () => {
    const parsed = parseBudget("от 10 000 до 20 000 руб");
    expect(parsed?.min).toBe(10000);
    expect(parsed?.max).toBe(20000);
  });

  it("понимает «от X»", () => {
    const parsed = parseBudget("от 10 000 руб");
    expect(parsed?.min).toBe(10000);
    expect(parsed?.max).toBeUndefined();
  });

  it("понимает «до X»", () => {
    const parsed = parseBudget("до 50 000 руб");
    expect(parsed?.min).toBeUndefined();
    expect(parsed?.max).toBe(50000);
  });

  it("одиночное число", () => {
    const parsed = parseBudget("1 500 ₽");
    expect(parsed?.min).toBe(1500);
    expect(parsed?.max).toBe(1500);
  });

  it("не склеивает миллион", () => {
    const parsed = parseBudget("1 500 000 руб");
    expect(parsed?.min).toBe(1500000);
    expect(parsed?.max).toBe(1500000);
  });

  it("неразрывный пробел внутри числа", () => {
    const parsed = parseBudget("50\u00A0000 руб");
    expect(parsed?.min).toBe(50000);
  });

  it("«Договорная» — без чисел", () => {
    const parsed = parseBudget("Договорная");
    expect(parsed?.min).toBeUndefined();
    expect(parsed?.max).toBeUndefined();
    expect(parsed?.raw).toBe("Договорная");
  });

  it("пустое значение", () => {
    expect(parseBudget("")).toBeUndefined();
    expect(parseBudget(undefined)).toBeUndefined();
  });
});
