const database = require('../../database/database'); // database 가져오기
const nodemailer = require('nodemailer'); // nodemailer
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();

// 회원 가입
const signUp = async (req, res) => {
  try {
    // 이메일 중복 검사
    const emailCheck = await database.query(
      `SELECT * FROM customers WHERE customer_email = $1`,
      [req.body.customer_email]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });
    }

    // 아이디 중복 검사
    const idCheck = await database.query(
      `SELECT * FROM customers WHERE customer_id = $1`,
      [req.body.customer_id]
    );
    if (idCheck.rows.length > 0) {
      return res.status(400).json({ message: '이미 사용 중인 아이디입니다.' });
    }

    // 비밀번호 해싱
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(req.body.customer_pw, salt);

    // 생년월일 포맷 설정
    const birthYear = req.body.customer_birth;
    const formattedBirthDate =
      birthYear.length === 4 ? `${birthYear}-01-01` : birthYear;

    const values = [
      req.body.customer_id,
      hash,
      req.body.customer_email,
      req.body.customer_name,
      req.body.customer_phone,
      req.body.customer_gender,
      formattedBirthDate,
      req.body.customer_city,
      req.body.customer_has_car,
      new Date(),
    ];

    await database.query(
      `INSERT INTO customers 
      (customer_id, customer_pw, customer_email, customer_name, customer_phone, 
      customer_gender, customer_birth, customer_city, customer_car, 
      created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      values
    );

    return res.status(201).json({ message: '회원 가입을 완료하였습니다.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 고객 로그인

const secretKey = 'YOUR_SECRET_KEY'; // JWT 시크릿 키를 설정하세요

const customLogin = async (req, res) => {
  const { customer_id, customer_pw } = req.body;
  try {
    const result = await database.query(
      'SELECT * FROM customers WHERE customer_id = $1',
      [customer_id]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(customer_pw, user.customer_pw))) {
      return res
        .status(401)
        .json({ message: '아이디와 비밀번호가 맞지 않습니다.' });
    }

    // 세션에 사용자 정보 저장
    req.session.userId = user.customer_id;
    req.session.userType = 'customer';

    // JWT 생성
    const token = jwt.sign(
      { userId: user.customer_id, userType: 'customer' },
      secretKey,
      { expiresIn: '1h' } // 토큰 유효 기간 설정 (예: 1시간)
    );

    return res.json({ message: '고객님 로그인 하였습니다.', token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 관리자 로그인
const adminLogin = async (req, res) => {
  const { admin_id, admin_pw } = req.body;
  try {
    const result = await database.query(
      'SELECT * FROM admins WHERE admin_id = $1',
      [admin_id]
    );
    const admin = result.rows[0];
    if (!admin || admin_pw !== admin.admin_pw) {
      return res
        .status(401)
        .json({ message: '아이디와 비밀번호가 맞지 않습니다.' });
    }
    req.session.userId = admin.admin_id;
    req.session.userType = 'admin'; // 관리자 세션 타입 설정
    return res.json({ message: '관리자님 로그인 하였습니다.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 딜러 로그인
const dealerLogin = async (req, res) => {
  const { employee_number, dealer_pw } = req.body;
  try {
    const result = await database.query(
      'SELECT * FROM dealers WHERE employee_number = $1',
      [employee_number]
    );
    const dealer = result.rows[0];
    if (!dealer || dealer_pw !== dealer.dealer_pw) {
      return res
        .status(401)
        .json({ message: '아이디와 비밀번호가 맞지 않습니다.' });
    }
    req.session.userId = dealer.employee_number;
    req.session.userType = 'dealer'; // 딜러 세션 타입 설정
    return res.json({ message: '영업팀 로그인 하였습니다.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 고객, 딜러, 관리자 로그 아웃
const logoutAll = (req, res) => {
  const { userType } = req.session;

  // 요청된 사용자 유형에 맞는 세션이 없으면 오류 반환
  if (!userType) {
    return res.status(400).json({ error: '로그인된 사용자가 없습니다.' });
  }

  // 고객 로그아웃 요청
  if (userType === 'customer') {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '고객 로그아웃 실패' });
      res.clearCookie('connect.sid');
      return res.status(200).json({ message: '고객님 로그아웃 되었습니다.' });
    });
  }

  // 딜러 로그아웃 요청
  else if (userType === 'dealer') {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '딜러 로그아웃 실패' });
      res.clearCookie('connect.sid');
      return res.status(200).json({ message: '딜러님 로그아웃 되었습니다.' });
    });
  }

  // 관리자 로그아웃 요청
  else if (userType === 'admin') {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '관리자 로그아웃 실패' });
      res.clearCookie('connect.sid');
      return res.status(200).json({ message: '관리자님 로그아웃 되었습니다.' });
    });
  }
};

// 아이디 찾기
const findId = async (req, res) => {
  const { customer_name, customer_email } = req.body;

  if (!customer_name || !customer_email) {
    return res
      .status(400)
      .json({ message: '이름과 이메일을 모두 입력해주세요.' });
  }

  try {
    const nameResult = await database.query(
      'SELECT customer_id, customer_email FROM customers WHERE customer_name = $1',
      [customer_name]
    );

    if (nameResult.rows.length === 0) {
      return res.status(404).json({ message: '일치하는 이름이 없습니다.' });
    }

    const user = nameResult.rows.find(
      (user) => user.customer_email === customer_email
    );

    if (user) {
      return res.json({
        message: '아이디 찾기에 성공했습니다.',
        userId: user.customer_id,
      });
    } else {
      return res
        .status(404)
        .json({ message: '이름은 일치하나 이메일이 일치하지 않습니다.' });
    }
  } catch (error) {
    console.error('DB 에러:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 이메일 인증 구현
const smtpTransporter = nodemailer.createTransport({
  host: 'smtp.naver.com', // naver smtp 사용
  port: 587, // 포트 587
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER, // 사용자 이메일
    pass: process.env.EMAIL_PASS, // 사용자 이메일 비밀번호
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const authNumbers = {}; // 인증번호 보관

const emailAuth = async (req, res) => {
  const email = req.body.customor_email;
  // 6자리 랜덤 인증번호 생성
  const emailRandomNumber = Math.floor(Math.random() * 899999) + 100000;
  console.log('생성된 인증번호:', emailRandomNumber);

  const mailOption = {
    from: process.env.EMAIL_USER, // 발신자 이메일
    to: email, // 수신자 이메일
    subject: '카봇 이메일 인증',
    html: `<h1>인증번호를 입력하세요:</h1> <p>${emailRandomNumber}</p>`,
  };

  smtpTransporter.sendMail(mailOption, (error, info) => {
    if (error) {
      console.log('이메일 전송 오류:', error);
      res.status(500).send('메일 전송 실패');
    } else {
      console.log('메일 전송 성공:', info.response);
      res.status(200).send('메일 전송 성공');
      authNumbers[email] = {
        code: emailRandomNumber,
        expires: Date.now() + 5 * 60000,
      }; // 인증번호 5분 유지
    }
  });
};

const verifyNumber = (req, res) => {
  const { email, code } = req.body; // code가 요청에서 제대로 전달되었는지 확인

  if (!authNumbers[email]) {
    return res.status(400).send('인증번호가 존재하지 않거나 만료되었습니다.');
  }

  // 인증번호 만료 확인
  if (Date.now() > authNumbers[email].expires) {
    delete authNumbers[email];
    return res.status(400).send('인증번호가 만료되었습니다.');
  }

  // 인증번호 일치 여부 확인
  if (String(authNumbers[email].code) === String(code)) {
    delete authNumbers[email];
    return res.status(200).send('인증 성공');
  } else {
    return res.status(400).send('인증번호가 일치하지 않습니다.');
  }
};

// 비밀번호 찾기 하기 전 아이디 이메일 확인
const verifyUser = async (req, res) => {
  const { customer_id, customer_email } = req.body;
  const checking = `SELECT * FROM customers WHERE customer_id = $1 AND customer_email = $2`;
  const values = [customer_id, customer_email];

  try {
    const { rows } = await database.query(checking, values);

    if (rows.length > 0) {
      return res.status(200).json({ success: true, user: rows[0] });
    } else {
      return res
        .status(404)
        .json({ success: false, message: '사용자 ID를 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res
      .status(500)
      .json({ success: false, message: '서버 오류가 났습니다.' });
  }
};

// 비밀번호 찾기
const updatePassword = async (req, res) => {
  const { new_password, customer_id } = req.body; // 요청 본문에서 데이터 추출

  try {
    const salt = 10;
    const newhashedPassword = await bcrypt.hash(new_password, salt); // 비밀번호 해시화

    // 데이터베이스 쿼리
    const changes = `UPDATE customers SET customer_pw = $1, updated_at = NOW() WHERE customer_id = $2`;
    const pw_values = [newhashedPassword, customer_id];
    await database.query(changes, pw_values);

    // 응답으로 성공 메시지 반환
    res
      .status(200)
      .json({ success: true, message: '패스워드를 업데이트 하였습니다.' });
  } catch (error) {
    console.error('Error:', error); // 오류 로깅
    res.status(500).json({ success: false, message: '서버 오류가 났습니다.' });
  }
};

module.exports = {
  signUp,
  customLogin,
  logoutAll,
  dealerLogin,
  adminLogin,
  findId,
  emailAuth,
  verifyNumber,
  verifyUser,
  updatePassword,
};
