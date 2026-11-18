"""Формы английских слов: go → goes, went, gone, going; city → cities.

Та же логика есть на сайте (site/js/domain/wordForms.js) — при изменении правьте оба файла.
"""
import re

IRREGULAR_VERBS = {
    "be": ["was", "were", "been", "is", "are", "am"], "have": ["had", "has"], "do": ["did", "done", "does"],
    "get": ["got", "gotten"], "go": ["went", "gone", "goes"], "swim": ["swam", "swum"], "find": ["found"],
    "choose": ["chose", "chosen"], "forget": ["forgot", "forgotten"], "buy": ["bought"], "hear": ["heard"],
    "feel": ["felt"], "take": ["took", "taken"], "see": ["saw", "seen"], "lie": ["lay", "lain", "lying"],
    "run": ["ran"], "say": ["said"], "make": ["made"], "come": ["came"], "know": ["knew", "known"],
    "think": ["thought"], "tell": ["told"], "give": ["gave", "given"], "write": ["wrote", "written"],
    "speak": ["spoke", "spoken"], "eat": ["ate", "eaten"], "drink": ["drank", "drunk"], "sleep": ["slept"],
    "leave": ["left"], "meet": ["met"], "pay": ["paid"], "send": ["sent"], "spend": ["spent"], "lose": ["lost"],
    "win": ["won"], "begin": ["began", "begun"], "bring": ["brought"], "teach": ["taught"], "catch": ["caught"],
    "fall": ["fell", "fallen"], "break": ["broke", "broken"], "sit": ["sat"], "stand": ["stood"],
    "understand": ["understood"], "wear": ["wore", "worn"], "sell": ["sold"], "keep": ["kept"], "build": ["built"],
    "drive": ["drove", "driven"], "fly": ["flew", "flown"], "sing": ["sang", "sung"], "become": ["became"],
    "hold": ["held"], "hide": ["hid", "hidden"], "steal": ["stole", "stolen"], "throw": ["threw", "thrown"],
    "grow": ["grew", "grown"], "forgive": ["forgave", "forgiven"], "freeze": ["froze", "frozen"],
    "feed": ["fed"], "lend": ["lent"], "ride": ["rode", "ridden"], "shine": ["shone"], "shake": ["shook", "shaken"],
    "wake": ["woke", "woken"], "lead": ["led"], "blow": ["blew", "blown"], "draw": ["drew", "drawn"],
    "bite": ["bit", "bitten"], "hang": ["hung"], "fight": ["fought"], "tear": ["tore", "torn"],
}


def verb_forms(verb):
    forms = {verb, verb + "s", verb + "es", verb + "ed", verb + "d", verb + "ing"}
    if verb.endswith("e"):
        forms.add(verb[:-1] + "ing")                              # make → making
    if re.search(r"[^aeiou]y$", verb):
        forms |= {verb[:-1] + "ies", verb[:-1] + "ied"}           # study → studies, studied
    if re.search(r"[aeiou][bdgklmnprtv]$", verb) and not re.search(r"[aeiou]{2}[a-z]$", verb):
        forms |= {verb + verb[-1] + "ed", verb + verb[-1] + "ing"}  # stop → stopped, stopping
    forms |= set(IRREGULAR_VERBS.get(verb, []))
    return forms


def noun_forms(noun):
    if len(noun) <= 2:                     # hi → «his» было бы ошибкой
        return {noun}
    forms = {noun, noun + "s", noun + "es"}
    if re.search(r"[^aeiou]y$", noun):
        forms.add(noun[:-1] + "ies")       # city → cities
    if noun.endswith("f"):
        forms.add(noun[:-1] + "ves")       # leaf → leaves
    if noun.endswith("fe"):
        forms.add(noun[:-2] + "ves")       # knife → knives
    return forms


def forms_of(english):
    """'to go out' → {'go out', 'went out', ...};  'credit card' → {'credit card', 'credit cards', ...}"""
    words = english.strip().split(" ")
    if words[0].lower() == "to" and len(words) > 1:
        verb, rest = words[1].lower(), words[2:]
        return {" ".join([form] + rest) for form in verb_forms(verb)}
    *start, last = words
    return {" ".join(start + [form]) for form in noun_forms(last)}
