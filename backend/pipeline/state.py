"""State graph. Semua nilai HARUS serializable (str/float/int/list/dict)
karena disimpan checkpointer Postgres -> UUID disimpan sebagai str."""

import operator 
from typing import Annotated , TypedDict 

class Block (TypedDict): 
    id : str 
    page_no : int 
    label : str 
    text : str 
    bbox : list [int]
    
class Criterion(TypedDict): 
    id : str 
    description: str 
    points : float 
    
    
class Question(TypedDict): 
    id : str 
    number : int 
    question_type: str 
    question_text: str 
    key_answer: str 
    max_points: float
    criteria : list[Criterion]
    
    
class QuestionResult(TypedDict, total=False): 
    question_id: str
    answer_status: str             # answered | unanswered | irrelevant | unmapped
    answer_text: str
    grade: float
    criteria_result: list[dict]    # untuk dosen (ada rubric)
    grading_internal: dict         # untuk dosen
    student_feedback: dict         # untuk mahasiswa (TANPA rubric karena rubric secret)
    bbox: list[dict]
    confidence: float
    needs_review: bool
    ocr_issue: str | None
    error: str | None


# main graph 

class SubmissionState(TypedDict, total=False):
    # input
    student_test_id: str
    
    # load_submission
    school_id: str
    subject_id: str
    teacher_id: str
    test_max_score: float
    quota_charged: bool
    questions: list[Question]
    blocks: list[Block]
    rules: list[str]
    
    # segment_answers
    segments: dict[str, list[str]]        # question_id -> [block_id]
    segment_method: str
    only_questions: list[str]             # regrade sebagian soal (kosong = semua)
    
    # budget_guard / hasil akhir
    run_status: str                       # running | quota_exceeded | graded | failed | not_answer_sheet 
    
    # dari subgraph (reducer: dijumlah / digabung dari banyak Send paralel)
    results: Annotated[list[QuestionResult], operator.add]
    tokens: Annotated[int, operator.add]
    
    # aggregate / cross_check
    total_grade: float
    needs_review: bool
    flags: list[str]
    
    
# -- sub graph 
# nama nya gabole sama kecuali results / tokens

class QuestionInput(TypedDict):
    q_question: Question
    q_blocks: list[Block]
    q_rules: list[str]
    q_teacher_id: str
    q_subject_id: str


class QuestionState(QuestionInput, total=False):
    q_answer_text: str
    q_status: str                          # answered | unanswered | irrelevant | unmapped
    q_precheck: str | None                 # alasan precheck
    q_ocr_issue: str | None
    q_traits: list[str]
    q_calcs: list[dict]                    # hasil cek aritmatika otomatis
    q_samples: list[dict]                  # hasil valid per sampel
    q_final: list[dict]                    # hasil per kriteria setelah reconcile/verify
    q_confidence: float
    q_verify: dict | None
    q_needs_review: bool
    q_notes: Annotated[list[str], operator.add]
    q_bbox: list[dict]
    q_feedback: dict
    q_error: str | None
    q_tokens: Annotated[int, operator.add]
    results: Annotated[list[QuestionResult], operator.add]
