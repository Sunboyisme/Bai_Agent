"""Deterministic tools. Model input never becomes executable Python code."""

import ast
from datetime import datetime, timedelta, timezone
from decimal import Decimal, DecimalException, localcontext
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def calculate(expression: str) -> dict:
    if not expression.strip() or len(expression) > 300:
        raise ValueError("算式不能为空，且不能超过 300 个字符。")
    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except (SyntaxError, RecursionError):
        raise ValueError("算式格式错误，请使用数字、括号和 + - * / // % **。") from None
    if len(list(ast.walk(tree))) > 100:
        raise ValueError("算式过于复杂，请拆分后计算。")

    def evaluate(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            # Preserve decimal literals instead of introducing binary float errors.
            result = Decimal(
                ast.get_source_segment(expression.strip(), node).replace("_", "")
            )
        elif isinstance(node, ast.UnaryOp) and isinstance(
            node.op, (ast.UAdd, ast.USub)
        ):
            value = evaluate(node.operand)
            result = -value if isinstance(node.op, ast.USub) else value
        elif isinstance(node, ast.BinOp):
            left, right = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Add):
                result = left + right
            elif isinstance(node.op, ast.Sub):
                result = left - right
            elif isinstance(node.op, ast.Mult):
                result = left * right
            elif isinstance(node.op, ast.Div):
                result = left / right
            elif isinstance(node.op, (ast.FloorDiv, ast.Mod)):
                quotient = (left / right).to_integral_value(rounding="ROUND_FLOOR")
                result = (
                    quotient
                    if isinstance(node.op, ast.FloorDiv)
                    else left - quotient * right
                )
            elif isinstance(node.op, ast.Pow):
                if right != right.to_integral_value() or abs(right) > 100:
                    raise ValueError("幂的指数必须是 -100 到 100 之间的整数。")
                result = left ** int(right)
            else:
                raise ValueError("只支持数字、括号和 + - * / // % **。")
        else:
            raise ValueError("只支持数字、括号和 + - * / // % **，不支持函数或代码。")
        if not result.is_finite() or abs(result) > Decimal("1e100"):
            raise ValueError("计算结果超出范围，请缩小数值。")
        return result

    try:
        with localcontext() as context:
            context.prec = 28
            value = evaluate(tree.body)
            return {"expression": expression, "result": str(value), "precision": 28}
    except (DecimalException, OverflowError):
        raise ValueError("无法计算，请检查除零、幂和数值范围。") from None


def date_time(
    timezone_name: str = "Asia/Shanghai",
    value: str = "",
    add_days: int = 0,
    compare_to: str = "",
) -> dict:
    try:
        zone = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("时区无效，请使用 Asia/Shanghai、UTC 等 IANA 时区。") from None
    if abs(add_days) > 36500:
        raise ValueError("日期偏移不能超过 36500 天。")

    def parse(text):
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            # Reject nonexistent and ambiguous local wall times around DST changes.
            early, late = (
                parsed.replace(tzinfo=zone, fold=0),
                parsed.replace(tzinfo=zone, fold=1),
            )
            if early.utcoffset() != late.utcoffset():
                raise ValueError(
                    "此本地时间处于夏令时切换区间，请提供带 UTC 偏移的时间。"
                )
            parsed = early
        return parsed.astimezone(zone)

    try:
        start = parse(value) if value else datetime.now(zone)
        result = start + timedelta(days=add_days)
        if add_days:
            result = parse(result.replace(tzinfo=None).isoformat())
        data = {
            "datetime": result.isoformat(),
            "timezone": timezone_name,
            "weekday": "星期" + "一二三四五六日"[result.weekday()],
            "add_days": add_days,
        }
        if compare_to:
            other = parse(compare_to)
            seconds = (
                other.astimezone(timezone.utc) - result.astimezone(timezone.utc)
            ).total_seconds()
            data.update(
                {
                    "compare_to": other.isoformat(),
                    "difference_seconds": seconds,
                    "difference_days": seconds / 86400,
                }
            )
        return data
    except (ValueError, OverflowError) as error:
        if str(error).startswith("此本地时间"):
            raise
        raise ValueError(
            "日期无效，请使用 ISO 8601，例如 2026-10-15 或 2026-10-15T09:00:00+08:00。"
        ) from None


# All factors are exact decimal strings relative to the base unit of each group.
UNITS = {
    "mm": ("length", "0.001"),
    "cm": ("length", "0.01"),
    "m": ("length", "1"),
    "km": ("length", "1000"),
    "in": ("length", "0.0254"),
    "ft": ("length", "0.3048"),
    "mile": ("length", "1609.344"),
    "mg": ("mass", "0.000001"),
    "g": ("mass", "0.001"),
    "kg": ("mass", "1"),
    "lb": ("mass", "0.45359237"),
    "ml": ("volume", "0.001"),
    "l": ("volume", "1"),
    "s": ("duration", "1"),
    "min": ("duration", "60"),
    "h": ("duration", "3600"),
    "day": ("duration", "86400"),
    "m/s": ("speed", "3.6"),
    "km/h": ("speed", "1"),
    "c": ("temperature", "1"),
    "f": ("temperature", "1"),
    "k": ("temperature", "1"),
}


def convert_units(value: str, from_unit: str, to_unit: str) -> dict:
    source, target = from_unit.strip().lower(), to_unit.strip().lower()
    if source not in UNITS or target not in UNITS:
        raise ValueError("不支持的单位。支持：" + ", ".join(UNITS))
    if UNITS[source][0] != UNITS[target][0]:
        raise ValueError("只能换算同类单位，例如长度与长度、温度与温度。")
    try:
        if len(value) > 100:
            raise ValueError("数值过长。")
        number = Decimal(value)
        if not number.is_finite() or abs(number) > Decimal("1e100"):
            raise ValueError("请输入有限数值，绝对值不能超过 1e100。")
        with localcontext() as context:
            context.prec = 28
            if UNITS[source][0] == "temperature":
                celsius = (
                    (number - 32) * 5 / 9
                    if source == "f"
                    else number - Decimal("273.15")
                    if source == "k"
                    else number
                )
                if celsius < Decimal("-273.15"):
                    raise ValueError("温度不能低于绝对零度。")
                result = (
                    celsius * 9 / 5 + 32
                    if target == "f"
                    else celsius + Decimal("273.15")
                    if target == "k"
                    else celsius
                )
            else:
                result = number * Decimal(UNITS[source][1]) / Decimal(UNITS[target][1])
            return {
                "value": value,
                "from_unit": source,
                "to_unit": target,
                "result": str(result),
            }
    except DecimalException:
        raise ValueError("数值格式无效，请输入数字。") from None
