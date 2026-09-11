package kr.co.ibk.aihub.api.components.aigovernance.aigovernance.service;

import kr.co.ibk.aihub.api.common.*;
import kr.co.ibk.aihub.api.common.util.AlarmCall;
import kr.co.ibk.aihub.api.common.util.CommonUtils;
import kr.co.ibk.aihub.api.components.aigovernance.aibrm.entity.AIBrm;
import kr.co.ibk.aihub.api.components.aigovernance.aibrm.repository.AIBrmRepository;
import kr.co.ibk.aihub.api.components.aigovernance.aidevguide.entity.AIDevGuide;
import kr.co.ibk.aihub.api.components.aigovernance.aidevguide.repository.AIDevGuideRepository;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.dto.AIGovernanceAttachFileRequestDto;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.dto.AIGovernanceRequestDto;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.dto.AIGovernanceResponseDto;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.entity.AIGovApprovalLine;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.entity.AIGovApprovalMain;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.entity.AIGovNotice;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.entity.AIGovNoticeAttachFile;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.repository.AIGovApprovalMainRepository;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.repository.AIGovNoticeAttachFileRepository;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.repository.AIGovNoticeRepository;
import kr.co.ibk.aihub.api.components.aigovernance.aigovernance.repository.AIGovernanceRepository;
import kr.co.ibk.aihub.api.components.employee.entity.Employee;
import kr.co.ibk.aihub.api.components.employee.repository.EmployeeRepository;
import kr.co.ibk.aihub.api.components.manager.entity.Manager;
import kr.co.ibk.aihub.api.components.manager.repository.ManagerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.transaction.Transactional;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AIGovernanceService {
    @Value("${upload.allow.count.aigovernance-notice}")
    private Integer allowCount;

    @Value("${upload.directory.aigovernance-notice}")
    private String rootDirectory;

    @Autowired
    private AIGovernanceRepository aIGovernanceRepository;

    @Autowired
    private AIGovApprovalMainRepository aIGovApprovalMainRepository;

    @Autowired
    private AIGovNoticeRepository aIGovNoticeRepository;

    @Autowired
    private AIGovNoticeAttachFileRepository aIGovNoticeAttachFileRepository;

    @Autowired
    private AIDevGuideRepository aIDevGuideRepository;

    @Autowired
    private AIBrmRepository AIBrmRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private ManagerRepository managerRepository;

    @Autowired
    private AlarmCall alarmCall;

    /**
     * AI 거버넌스 내 신청내역 결재건수 조회
     * @return
     */
    public AIGovernanceResponseDto.ApprovalCnt selectAIGovernanceMyRequestApprovalCnt(String rqstDsncKind, String userId) {
        return aIGovernanceRepository.selectAIGovernanceMyRequestApprovalCnt(rqstDsncKind, userId);
    }

    /**
     * AI 거버넌스 내 결재 건수 조회
     * @return
     */
    public Long selectAIGovernanceMyApprovalCnt(String userId, String kind) {
        return aIGovernanceRepository.selectAIGovernanceMyApprovalCnt(userId, kind);
    }

    /**
     * AI 거버넌스 내 결재 조회
     * @return
     */
    public Page<AIGovernanceResponseDto.MyApproval> selectAIGovernanceMyApproval(String userId, Pageable pageable, String kind, String workKind, String rqstDsncNm, String snctScd, String stlmTtlNm) {
        return aIGovernanceRepository.selectAIGovernanceMyApproval(userId, pageable, kind, workKind, rqstDsncNm, snctScd, stlmTtlNm);
    }

    /**
     * AI 거버넌스 결재목록 조회
     * @return
     */
    public Page<AIGovernanceResponseDto.ApprovalList> selectAIGovernanceApprovalList(String userId, Pageable pageable, String workKind, String rqstDsncNm, String snctScd, String stlmTtlNm) {
        return aIGovernanceRepository.selectAIGovernanceApprovalList(userId, pageable, workKind, rqstDsncNm, snctScd, stlmTtlNm);
    }

    /**
     * AI 거버넌스 결재요청
     * @return
     */
    @Transactional
    public void createAIGovApprovalRequest(AIGovernanceRequestDto.ApprovalRequest aiGovernanceRequestDto) throws IOException {
        AIGovApprovalMain aIGovApprovalMain = aiGovernanceRequestDto.toEntity();
        AIGovApprovalMain saved = aIGovApprovalMainRepository.save(aIGovApprovalMain);

        alarmCall.call(saved.getApprovalLine().get(0).getSnctAprrEmn(), saved.getCreatedBy(), "결재요청", "AI 거버넌스의 결재요청이 있습니다.", "결재요청", "http://aiportal.ibk.co.kr/portal/aigovernance/approval/list");
    }

    /**
     * AI 거버넌스 결재승인
     * @return
     */
    @Transactional
    public void confirmApproval(String userId, AIGovernanceRequestDto.ConfirmApproval aiGovernanceRequestDto) throws IOException {
        Optional<AIGovApprovalMain> oAIGovApprovalMain = aIGovApprovalMainRepository.findByIdAndDelYn(aiGovernanceRequestDto.getId(), Const.NO);

        if (oAIGovApprovalMain.isPresent()) {
            AIGovApprovalMain aIGovApprovalMain = oAIGovApprovalMain.get();

            if (aIGovApprovalMain.getSnctScd().equals(ApprovalStatus.STANDBY.getCode())) {
                List<AIGovApprovalLine> aIGovApprovalLineList = aIGovApprovalMain.getApprovalLine();
                Iterator<AIGovApprovalLine> iterators = aIGovApprovalLineList.iterator();

                boolean isConfirmed = false;
                boolean isNextConfirmed = false;
                int nextSeq = -1;

                while (iterators.hasNext()) {
                    AIGovApprovalLine aIGovApprovalLine = iterators.next();

                    if (aIGovApprovalLine.getId().equals(aiGovernanceRequestDto.getLineId()) &&
                            ApprovalStatus.STANDBY.getCode().equals(aIGovApprovalLine.getSnctScd()) &&
                            aIGovApprovalLine.getSnctAprrEmn().equals(userId)) {
                        aIGovApprovalLine.confirm();

                        isConfirmed = true;
                        nextSeq = aIGovApprovalLine.getSnlnSrn() + 1;

                        // 마지막 결재자일 경우
                        if (!iterators.hasNext()) {
                            aIGovApprovalMain.confirm();

                            if (aIGovApprovalMain.getServiceSrn() != null) {
                                Optional<AIDevGuide> oAIDevGuide = aIDevGuideRepository.findByIdAndDelYn(aIGovApprovalMain.getServiceSrn(), Const.NO);

                                if (oAIDevGuide.isPresent()) {
                                    AIDevGuide aIDevGuide = oAIDevGuide.get();
                                    String serviceScd = aIDevGuide.getServiceScd();
                                    String rqstDsncNm = aIGovApprovalMain.getRqstDsncNm();
                                    if (AIGovernanceRqstDsncNm.AIDEVGUIDE_RISK_GRADE.getCode().equals(rqstDsncNm)) {
                                        serviceScd = AIDevGuideStatus.AIDEVGUIDE_RISK_GRADE_REVIEW_REGIST.getCode();
                                    } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_RISK_GRADE_REVIEW.getCode().equals(rqstDsncNm)) {
                                        serviceScd = AIDevGuideStatus.AIDEVGUIDE_ADOPTION_REGIST.getCode();
                                    } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_ADOPTION.getCode().equals(rqstDsncNm)) {
                                        serviceScd = AIDevGuideStatus.AIDEVGUIDE_PRERELEASE_REVIEW_REGIST.getCode();
                                    } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_PRERELEASE_REVIEW.getCode().equals(rqstDsncNm)) {
                                        serviceScd = AIDevGuideStatus.AIDEVGUIDE_POST_MANAGEMENT_REGIST.getCode();
                                    } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_POST_MANAGEMENT.getCode().equals(rqstDsncNm)) {
                                        serviceScd = AIDevGuideStatus.AIDEVGUIDE_FINISH.getCode();
                                    }
                                    aIDevGuide.updateServiceScd(serviceScd);

                                    alarmCall.call(aIGovApprovalMain.getCreatedBy(), aIGovApprovalLine.getSnctAprrEmn(), "결재완료", "AI 거버넌스의 결재가 완료되었습니다.", "결재완료", "http://aiportal.ibk.co.kr/portal/aigovernance/aidevguide/main");

                                    // 최종 결재 완료 시 AI 거버넌스 담당자에게 알림 발송
                                    List<Manager> gvManager = managerRepository.findByBswrAthrNm(Role.ROLE_GV.getRole());
                                    for (Manager m : gvManager) {
                                        alarmCall.call(m.getMngrEmn(), aIGovApprovalLine.getSnctAprrEmn(), "AI 거버넌스", "AI 거버넌스의 단계가 진행되었습니다.", "AI 거버넌스", "http://aiportal.ibk.co.kr/portal/aigovernance/aidevguide/main");
                                    }
                                }
                            } else if (aIGovApprovalMain.getBrmSrn() != null) {
                                Optional<AIBrm> oAIBrm = AIBrmRepository.findByIdAndDelYn(aIGovApprovalMain.getBrmSrn(), Const.NO);

                                if (oAIBrm.isPresent()) {
                                    AIBrm aIBrm = oAIBrm.get();
                                    String brmStatScd = aIBrm.getBrmStatScd();
                                    String rqstDsncNm = aIGovApprovalMain.getRqstDsncNm();
                                    if (AIGovernanceRqstDsncNm.AIBRM_REQUEST.getCode().equals(rqstDsncNm)) {
                                        brmStatScd = AIBrmStatus.AIBRM_PROCESS_REGIST.getCode();
                                    } else if (AIGovernanceRqstDsncNm.AIBRM_PROCESS.getCode().equals(rqstDsncNm)) {
                                        brmStatScd = AIBrmStatus.AIBRM_PROCESS_FINISH.getCode();
                                    }
                                    aIBrm.updateBrmStatScd(brmStatScd);

                                    alarmCall.call(aIGovApprovalMain.getCreatedBy(), aIGovApprovalLine.getSnctAprrEmn(), "결재완료", "AI 거버넌스의 결재가 완료되었습니다.", "결재완료", "http://aiportal.ibk.co.kr/portal/aigovernance/aibrm/main");
                                    alarmCall.call(aIBrm.getBrmEmn(), aIGovApprovalLine.getSnctAprrEmn(), "AI 거버넌스", "AI-BRM 단계가 진행되었습니다.", "AI 거버넌스", "http://aiportal.ibk.co.kr/portal/aigovernance/aibrm/main");
                                }
                            }
                        }
                    }

                    if (isConfirmed && !isNextConfirmed
                            && aIGovApprovalLine.getSnctScd().equals(ApprovalStatus.REQUEST.getCode())
                            && aIGovApprovalLine.getSnlnSrn() == nextSeq) {
                        aIGovApprovalLine.next();
                        isNextConfirmed = true;
                        alarmCall.call(aIGovApprovalLine.getSnctAprrEmn(), aIGovApprovalMain.getCreatedBy(), "결재요청", "AI 거버넌스의 결재요청이 있습니다.", "결재요청", "http://aiportal.ibk.co.kr/portal/aigovernance/approval/list");
                    }
                }
            }
        }
    }

    /**
     * AI 거버넌스 결재반려
     * @return
     */
    @Transactional
    public void rejectApproval(String userId, AIGovernanceRequestDto.RejectApproval aiGovernanceRequestDto) throws IOException {
        Optional<AIGovApprovalMain> oAIGovApprovalMain = aIGovApprovalMainRepository.findByIdAndDelYn(aiGovernanceRequestDto.getId(), Const.NO);

        if (oAIGovApprovalMain.isPresent()) {
            AIGovApprovalMain aIGovApprovalMain = oAIGovApprovalMain.get();

            if (aIGovApprovalMain.getSnctScd().equals(ApprovalStatus.STANDBY.getCode())) {
                List<AIGovApprovalLine> aIGovApprovalLineList = aIGovApprovalMain.getApprovalLine();

                for (AIGovApprovalLine aIGovApprovalLine : aIGovApprovalLineList) {
                    if (aIGovApprovalLine.getId().equals(aiGovernanceRequestDto.getLineId()) &&
                            ApprovalStatus.STANDBY.getCode().equals(aIGovApprovalLine.getSnctScd()) &&
                            aIGovApprovalLine.getSnctAprrEmn().equals(userId)) {
                        aIGovApprovalLine.reject();

                        if (aIGovApprovalMain.getServiceSrn() != null) {
                            Optional<AIDevGuide> oAIDevGuide = aIDevGuideRepository.findByIdAndDelYn(aIGovApprovalMain.getServiceSrn(), Const.NO);

                            if (oAIDevGuide.isPresent()) {
                                AIDevGuide aIDevGuide = oAIDevGuide.get();
                                String serviceScd = aIDevGuide.getServiceScd();
                                String rqstDsncNm = aIGovApprovalMain.getRqstDsncNm();
                                if (AIGovernanceRqstDsncNm.AIDEVGUIDE_RISK_GRADE.getCode().equals(rqstDsncNm)) {
                                    serviceScd = AIDevGuideStatus.AIDEVGUIDE_RISK_GRADE_REGIST.getCode();
                                } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_RISK_GRADE_REVIEW.getCode().equals(rqstDsncNm)) {
                                    serviceScd = AIDevGuideStatus.AIDEVGUIDE_RISK_GRADE_REVIEW_REGIST.getCode();
                                } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_ADOPTION.getCode().equals(rqstDsncNm)) {
                                    serviceScd = AIDevGuideStatus.AIDEVGUIDE_ADOPTION_REGIST.getCode();
                                } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_PRERELEASE_REVIEW.getCode().equals(rqstDsncNm)) {
                                    serviceScd = AIDevGuideStatus.AIDEVGUIDE_PRERELEASE_REVIEW_REGIST.getCode();
                                } else if (AIGovernanceRqstDsncNm.AIDEVGUIDE_POST_MANAGEMENT.getCode().equals(rqstDsncNm)) {
                                    serviceScd = AIDevGuideStatus.AIDEVGUIDE_POST_MANAGEMENT_REGIST.getCode();
                                }
                                aIDevGuide.updateServiceScd(serviceScd);

                                alarmCall.call(aIGovApprovalMain.getCreatedBy(), aIGovApprovalLine.getSnctAprrEmn(), "결재반려", "AI 거버넌스의 결재가 반려되었습니다.", "결재반려", "http://aiportal.ibk.co.kr/portal/aigovernance/aidevguide/main");
                            }
                        } else if (aIGovApprovalMain.getBrmSrn() != null) {
                            Optional<AIBrm> oAIBrm = AIBrmRepository.findByIdAndDelYn(aIGovApprovalMain.getBrmSrn(), Const.NO);

                            if (oAIBrm.isPresent()) {
                                AIBrm aIBrm = oAIBrm.get();
                                String brmStatScd = aIBrm.getBrmStatScd();
                                String rqstDsncNm = aIGovApprovalMain.getRqstDsncNm();
                                if (AIGovernanceRqstDsncNm.AIBRM_REQUEST.getCode().equals(rqstDsncNm)) {
                                    brmStatScd = AIBrmStatus.AIBRM_REQUEST_REGIST.getCode();
                                } else if (AIGovernanceRqstDsncNm.AIBRM_PROCESS.getCode().equals(rqstDsncNm)) {
                                    brmStatScd = AIBrmStatus.AIBRM_PROCESS_REGIST.getCode();
                                }
                                aIBrm.updateBrmStatScd(brmStatScd);

                                alarmCall.call(aIGovApprovalMain.getCreatedBy(), aIGovApprovalLine.getSnctAprrEmn(), "결재반려", "AI 거버넌스의 결재가 반려되었습니다.", "결재반려", "http://aiportal.ibk.co.kr/portal/aigovernance/aibrm/main");
                            }
                        }
                    }
                }
                aIGovApprovalMain.reject(aiGovernanceRequestDto.getRejectReason());
            }
        }
    }

    /**
     *  AI 개발운영가이드 결재라인 조회
     * @return
     */
    public List<AIGovernanceResponseDto.AIDevGuideApprovalLine> selectAIDevGuideApprovalLine(Long serviceSrn, String rqstDsncNm) {
        return aIGovernanceRepository.selectAIDevGuideApprovalLine(serviceSrn, rqstDsncNm);
    }

    /**
     *  AI 개발운영가이드 내 결재라인 조회
     * @return
     */
    public List<AIGovernanceResponseDto.AIDevGuideApprovalLine> selectAIDevGuideMyApprovalLine(Long serviceSrn, String rqstDsncNm, String userId) {
        return aIGovernanceRepository.selectAIDevGuideMyApprovalLine(serviceSrn, rqstDsncNm, userId);
    }

    /**
     *  AI 개발운영가이드 결재자 여부
     * @return
     */
    public boolean getIsAIDevGuideApprovalPerson(Long serviceSrn, String rqstDsncNm, String userId) {
        return aIGovernanceRepository.getIsAIDevGuideApprovalPerson(serviceSrn, rqstDsncNm, userId);
    }

    /**
     *  AI-BRM 결재라인 조회
     * @return
     */
    public List<AIGovernanceResponseDto.AIBrmApprovalLine> selectAIBrmApprovalLine(Long brmSrn, String rqstDsncNm) {
        return aIGovernanceRepository.selectAIBrmApprovalLine(brmSrn, rqstDsncNm);
    }

    /**
     *  AI-BRM 결재자 여부
     * @return
     */
    public boolean getIsAIBrmApprovalPerson(Long brmSrn, String rqstDsncNm, String userId) {
        return aIGovernanceRepository.getIsAIBrmApprovalPerson(brmSrn, rqstDsncNm, userId);
    }

    /**
     * 공지사항 목록
     * @param keyWord
     * @param pageable
     * @return
     */
    public Page<AIGovernanceResponseDto.NoticeSearch> selectNoticeList(String keyWord, Pageable pageable) {
        return aIGovernanceRepository.findAllNoticeBySearch(keyWord, pageable);
    }

    /**
     * 공지사항 저장
     * @param aIGovernanceRequestDto
     * @return
     * @throws IOException
     */
    @Transactional
    public Long saveNotice(AIGovernanceRequestDto.NoticeCreate aIGovernanceRequestDto) throws IOException {
        List<AIGovernanceAttachFileRequestDto> attachFileDtos = new ArrayList<>();

        if (aIGovernanceRequestDto.getFiles() != null) {
            for (MultipartFile multipartFile : aIGovernanceRequestDto.getFiles()) {

                if (multipartFile != null && multipartFile.getSize() > 0) {
                    String randomFilename = CommonUtils.makeFileName();

                    AIGovernanceAttachFileRequestDto noticeAttachFileRequestDto = AIGovernanceAttachFileRequestDto
                            .builder()
                            .fileSz(multipartFile.getSize())
                            .orgnlFileNm(multipartFile.getOriginalFilename())
                            .strgPath(rootDirectory)
                            .strgFileNm(multipartFile.getOriginalFilename().lastIndexOf(".") == -1 ?
                                    randomFilename:
                                    randomFilename.concat(multipartFile.getOriginalFilename().substring(multipartFile.getOriginalFilename().lastIndexOf("."))))
                            .delYn(Const.NO)
                            .build();

                    Path path = Paths.get(noticeAttachFileRequestDto.getStrgPath(), noticeAttachFileRequestDto.getStrgFileNm());

                    FileUtils.copyInputStreamToFile(multipartFile.getInputStream(), new File(path.toString()));
                    attachFileDtos.add(noticeAttachFileRequestDto);
                }
            }
        }

        AIGovNotice notice = aIGovernanceRequestDto.toEntity(attachFileDtos);

        aIGovNoticeRepository.save(notice);

        return notice.getId();
    }

    /**
     * 공지사항 수정
     * @param id
     * @param noticeDto
     * @return
     * @throws IOException
     */
    @Transactional
    public int updateNotice(String userId, Long id, AIGovernanceRequestDto.NoticeUpdate noticeDto) throws IOException {
        Optional<AIGovNotice> oNotice = aIGovNoticeRepository.findByIdAndDelYn(id, Const.NO);

        if (!oNotice.isPresent()) {
            return -1;
        } else {
            AIGovNotice notice = oNotice.get();

            int existedFileCount = 0;
            for (AIGovNoticeAttachFile noticeAttachFile : notice.getFiles()) {
                if (Const.NO.equals(noticeAttachFile.getDelYn())) {
                    existedFileCount ++;
                }
            }

            if (noticeDto.getFiles() != null && !noticeDto.getFiles().isEmpty() && noticeDto.getFiles().size()  + existedFileCount > allowCount) {
                return -2;
            }

            List<AIGovernanceAttachFileRequestDto> attachFileDtos = new ArrayList<>();

            if (noticeDto.getFiles() != null) {
                for (MultipartFile multipartFile : noticeDto.getFiles()) {

                    if (multipartFile != null && multipartFile.getSize() > 0) {
                        String randomFilename = CommonUtils.makeFileName();

                        AIGovernanceAttachFileRequestDto noticeAttachFileRequestDto = AIGovernanceAttachFileRequestDto
                                .builder()
                                .fileSz(multipartFile.getSize())
                                .orgnlFileNm(multipartFile.getOriginalFilename())
                                .strgPath(rootDirectory)
                                .strgFileNm(multipartFile.getOriginalFilename().lastIndexOf(".") == -1 ?
                                        randomFilename :
                                        randomFilename.concat(multipartFile.getOriginalFilename().substring(multipartFile.getOriginalFilename().lastIndexOf("."))))
                                .delYn(Const.NO)
                                .build();

                        Path path = Paths.get(noticeAttachFileRequestDto.getStrgPath(), noticeAttachFileRequestDto.getStrgFileNm());

                        FileUtils.copyInputStreamToFile(multipartFile.getInputStream(), new File(path.toString()));

                        attachFileDtos.add(noticeAttachFileRequestDto);
                    }
                }
            }

            notice.update(userId, noticeDto, attachFileDtos);
            return 1;
        }
    }

    /**
     * 공지사항 삭제
     * @param id
     * @return
     */
    @Transactional
    public int deleteNotice(Long id) {
        Optional<AIGovNotice> oNotice = aIGovNoticeRepository.findByIdAndDelYn(id, Const.NO);

        if (!oNotice.isPresent()) {
            return -1;
        } else {
            AIGovNotice notice = oNotice.get();

            for (AIGovNoticeAttachFile noticeAttachFile : notice.getFiles()){
                if (Const.NO.equals(noticeAttachFile.getDelYn())) {
                    noticeAttachFile.delete();
                }
            }
            notice.delete();
        }
        return 1;
    }

    /**
     * 공지사항 파일 삭제
     * @param id
     * @param fileId
     * @return
     * @throws IOException
     */
    @Transactional
    public int deleteNoticeFile(Long id, Long fileId) throws IOException {
        Optional<AIGovNotice> oNotice = aIGovNoticeRepository.findById(id);

        if (!oNotice.isPresent()) {
            return -1;
        } else {
            AIGovNotice notice = oNotice.get();

            for (AIGovNoticeAttachFile noticeAttachFile : notice.getFiles()){
                if (noticeAttachFile.getId().equals(fileId)) {
                    if (Const.NO.equals(noticeAttachFile.getDelYn())) {
                        noticeAttachFile.delete();
                    }
                }
            }
        }

        return 1;
    }

    @Transactional
    public AIGovernanceResponseDto.NoticeDetail getNotice(Long id) {
        Optional<AIGovNotice> oNotice = aIGovNoticeRepository.findByIdAndDelYn(id, Const.NO);

        if (!oNotice.isPresent()) {
            return null;
        } else {
            AIGovNotice notice = oNotice.get();
            aIGovNoticeRepository.increaseInqCount(notice.getId());

            Optional<Employee> oEmployee = employeeRepository.findById(notice.getUpdatedBy());
            Employee employee = null;
            if (oEmployee.isPresent()){
                employee = oEmployee.get();
            }

            return AIGovernanceResponseDto.NoticeDetail.builder().notice(notice).employee(employee).build();
        }
    }

    public AIGovernanceResponseDto.NoticeFileDetail getNoticeFile(Long id, Long fileId) {
        AIGovernanceResponseDto.NoticeFileDetail detail = aIGovernanceRepository.selectOne(id, fileId);

        return detail;
    }

    /**
     *  All AI 목록 조회
     * @return
     */
    public Page<AIGovernanceResponseDto.AIMonitorSearch> selectAIMonitorList(Pageable pageable) {
        return aIGovernanceRepository.findAIMonitorBySearch(pageable);
    }

    /**
     * 결재 건수 조회
     *
     * @param userId
     * @return
     */
    public AIGovernanceResponseDto.Info info(String userId) {
        return aIGovernanceRepository.findInfo(userId);
    }
}
